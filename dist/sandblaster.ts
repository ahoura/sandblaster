/*********************
 *                   *
 *   Analysis code   *
 *                   *
 *********************/
function _analyzeSandboxing(frameEl, errback) {
  /*jshint maxstatements:45 */
  //
  // An interesting note from: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe
  //
  // NOTE:
  //   "When the embedded document has the same origin as the main
  //    page, it is strongly discouraged to use both allow-scripts
  //    and allow-same-origin at the same time, as that allows the
  //    embedded document to programmatically remove the sandbox
  //    attribute. Although it is accepted, this case is no more
  //    secure than not using the sandbox attribute."
  //
  // So... let's give that a try, too! >=D
  //
  var sandboxAllowances, resandboxable, resandboxAllowances, resandboxLossless, result = {
    sandboxed: undefined,
    sandboxAllowances: undefined,
    unsandboxable: undefined,
    resandboxable: undefined,
    errors: []
  };
  if (this._isFrameElement(frameEl)) {
    // Is sandboxed?
    try {
      result.sandboxed = frameEl.hasAttribute("sandbox");
    } catch (sandboxErr) {
      result.sandboxed = null;
      if (typeof errback === "function") {
        errback(sandboxErr);
      }
    }
    // Get sandbox configuration
    if (result.sandboxed) {
      try {
        sandboxAllowances = frameEl.getAttribute("sandbox") || "";
      } catch (sandboxErr) {
        sandboxAllowances = null;
        if (typeof errback === "function") {
          errback(sandboxErr);
        }
      }
    } else if (result.sandboxed === null) {
      sandboxAllowances = null;
    }
    if (sandboxAllowances === null || typeof sandboxAllowances === "string") {
      result.sandboxAllowances = this._createAllowancesMap(sandboxAllowances);
    }
    // Analyze desandboxability
    if (result.sandboxed) {
      try {
        frameEl.removeAttribute("sandbox");
        result.unsandboxable = !frameEl.hasAttribute("sandbox");
      } catch (sandboxErr) {
        result.unsandboxable = false;
        if (typeof errback === "function") {
          errback(sandboxErr);
        }
      }
    }
    // Analyze resandboxability
    if (result.unsandboxable && typeof sandboxAllowances === "string") {
      try {
        frameEl.setAttribute("sandbox", sandboxAllowances);
        resandboxable = frameEl.hasAttribute("sandbox");
      } catch (sandboxErr) {
        resandboxable = false;
        if (typeof errback === "function") {
          errback(sandboxErr);
        }
      }
    }
    // Get resandboxed configuration
    if (resandboxable && result.sandboxAllowances) {
      try {
        resandboxAllowances = frameEl.getAttribute("sandbox") || "";
      } catch (sandboxErr) {
        resandboxAllowances = null;
        if (typeof errback === "function") {
          errback(sandboxErr);
        }
      }
    } else if (resandboxable === null) {
      resandboxAllowances = null;
    }
    if (resandboxAllowances === null || typeof resandboxAllowances === "string") {
      resandboxAllowances = this._createAllowancesMap(resandboxAllowances);
    }
    // Analyze quality of resandboxability
    if (resandboxable) {
      resandboxLossless = null;
      if (result.sandboxAllowances && resandboxAllowances) {
        resandboxLossless = this._sandboxAllowancesMatch(result.sandboxAllowances, resandboxAllowances);
      }
    }
    result.resandboxable = resandboxLossless;
  }
  return result;
}


export interface SandBlasterSettings{
  //nothing yet
}

export class SandBlaster {
  _initialState: object;
  _unsandboxState: any;
  settings: SandBlasterSettings = {}

  constructor(_settings?) {
    Object.assign(this.settings, _settings);
    this._initialState = this.detect();
    this._unsandboxState = null;
  }


  //public methods
  unsandbox = function() {
    let _current, frameEl, result = false,
      sb = this,
      _init = sb._initialState;
    // If the page was never framed, bail out early because it will never change
    if (_init.framed === false) {
      result = true;
    } else if (_init.crossOrigin === false) {
      _current = sb.detect();
      result = _current.sandboxed === false;
      // Unsandbox it
      if (_current.sandboxed && _current.unsandboxable) {
        // Keep track of the state of the frame before unsandboxing for potential resandboxing later
        sb._unsandboxState = _current;
        frameEl = this._getFrame(function() {
          result = false;
        });
        if (frameEl) {
          try {
            frameEl.removeAttribute("sandbox");
            result = !frameEl.hasAttribute("sandbox");
          } catch (err) {
            result = false;
          }
        }
      }
    }
    return result;
  };

  reload = function sandblaster$unsandboxAndReload() {
    var frameEl, attrs, newFrameEl, replacedFrameEl, result = false,
      sb = this,
      _init = sb._initialState;
    // If the page was never framed or was cross-origin, bail out early because it will never change
    if (_init.framed && _init.crossOrigin === false) {
      frameEl = this._getFrame();
      if (frameEl) {
        try {
          if (frameEl.parentNode && frameEl.parentNode.ownerDocument) {
            attrs = _slice.call(frameEl.attributes).map(function(item) {
              return {
                name: item.name,
                value: item.value
              };
            });
            newFrameEl = frameEl.parentNode.ownerDocument.createElement("iframe");
            attrs.forEach(function(item) {
              newFrameEl.setAttribute(item.name, item.value);
            });
            replacedFrameEl = frameEl.parentNode.replaceChild(newFrameEl, frameEl);
            result = frameEl === replacedFrameEl;
          }
        } catch (err) {
          result = false;
        }
      }
    }
    return result;
  }

  sandbox = function(sandboxAllowances) {
    var allowancesString, keys, _current, _currentAllowances, isLockingDown, frameEl, sandboxAttr, result = false,
      sb = this,
      _init = sb._initialState,
      allowanceList = [];
    if (sandboxAllowances && typeof sandboxAllowances === "object" && _init.framed && _init.crossOrigin !== false) {
      // Verify the state before continuing
      _current = sb.detect();
      // BUT also conduct some other live checks before attempting to sandbox it
      if (_current.sandboxed === false && _current.sandboxable || _current.sandboxed && _current.unsandboxable) {
        _currentAllowances = _current.sandboxAllowances;
        keys = this._union(Object.keys(sandboxAllowances), Object.keys(_currentAllowances || {}));
        keys.forEach(function(allowance) {
          if (sandboxAllowances[allowance] === true || sandboxAllowances[allowance] == null && _currentAllowances && _currentAllowances[allowance] === true) {
            allowanceList.push("allow-" + allowance.replace(/[A-Z]/g, "-$1").toLowerCase());
          }
        });
        if (allowanceList.length > 0 && (frameEl = this._getFrame())) {
          isLockingDown = allowanceList.indexOf("allow-same-origin") === -1 || allowanceList.indexOf("allow-scripts") === -1;
          allowancesString = allowanceList.sort().join(" ");
          try {
            // Add/update the sandbox
            frameEl.setAttribute("sandbox", allowancesString);
            result = isLockingDown;
          } catch (err) {
            result = false;
          }
          // Get a fresh element reference (or `null`)
          if (frameEl = this._getFrame()) {
            // May throw a SecurityError now, depending on the new sandbox configuration
            try {
              sandboxAttr = (frameEl.getAttribute("sandbox") || "").replace(/^\s+|\s+$/g, "").split(/\s+/).sort().join(" ");
              result = sandboxAttr === allowancesString || isLockingDown && (sandboxAttr === "" || this._getEffectiveScriptOrigin() === null);
            } catch (err) {
              // May not be able to touch the sandbox anymore due to security lockdown and/or
              // script disabling (if it even lets this event loop iteration finish!?)
              result = isLockingDown;
            }
          }
        }
      }
    }
    return result;
  };

  resandbox = function sandblaster$resandbox() {
    var result = false,
      sb = this;
    // If the page was unsandboxed, try to resandbox it
    if (sb._unsandboxState != null) {
      result = sb.sandbox(sb._unsandboxState.sandboxAllowances);
    }
    // If it succeeded, don't keep track of the previous unsandboxed state anymore
    if (result === true) {
      sb._unsandboxState = null;
    }
    return result;
  };

  detect = function sandblaster$detect() {
    var frame, frameError, subResult, results = {
        framed: false,
        crossOrigin: null,
        sandboxed: null,
        sandboxAllowances: undefined,
        unsandboxable: undefined,
        resandboxable: undefined,
        sandboxable: undefined,
        errors: []
      },
      errback = function(err) {
        results.errors.push(this._cloneError(err));
      },
      frameErrback = function(err) {
        frameError = this._cloneError(err);
        results.errors.push(frameError);
      };
    try {
      results.framed = this._isWindowFramed();
      if (!results.framed) {
        results.crossOrigin = undefined;
        results.sandboxed = undefined;
        results.errors = undefined;
      } else {
        frame = this._getFrame(frameErrback);
        if (frame != null) {
          results.crossOrigin = false;
          subResult = _analyzeSandboxing(frame, errback);
          results.sandboxed = subResult.sandboxed;
          results.sandboxAllowances = subResult.sandboxAllowances;
          results.unsandboxable = subResult.unsandboxable;
          results.resandboxable = subResult.resandboxable;
        } else {
          // IMPORTANT:
          // Firefox will return `frame == null` and NOT throw any Error for
          // cross-origin `frameElement` access:
          //   https://bugzilla.mozilla.org/show_bug.cgi?id=868235
          // Set the most frequent default values
          results.crossOrigin = true;
          results.sandboxed = null;
          results.sandboxAllowances = {
            forms: null,
            modals: null,
            orientationLock: null,
            pointerLock: null,
            popups: null,
            popupsToEscapeSandbox: null,
            sameOrigin: null,
            scripts: true,
            topNavigation: null
          };
          results.unsandboxable = false;
          results.resandboxable = false;
          // `document.domain` has been rendered useless by sandboxing
          // without granting `allow-same-origin`
          if (this._getEffectiveScriptOrigin(errback) === null) {
            results.sandboxed = true;
            results.sandboxAllowances.sameOrigin = false;
          } else if (frameError) {
            if (frameError.name !== "SecurityError") {
              // Retract previous value... we're not sure anymore!
              results.crossOrigin = null;
            } else if (/(^|[\s\(\[@])sandbox(es|ed|ing|[\s\.,!\)\]@]|$)/.test(frameError.message.toLowerCase())) {
              results.sandboxed = true;
              results.sandboxAllowances.sameOrigin = true;
            }
          }
        }
        // Finally, do some analysis to see if we can authoritatively add sandboxing (e.g. if not sandboxed already)
        results.sandboxable = results.resandboxable || results.framed === true && results.crossOrigin === false && (results.sandboxed === false || results.sandboxAllowances.sameOrigin) || false;
      }
    } catch (err) {
      errback(err);
    }
    return results;
  };



  /**********************
  *                    *
  *   Private Methods  *
  *                    *
  **********************/

  private _getFrame = function(errback) {
    let frameEl;
    try {
      frameEl = window.frameElement;
      if (!this._isFrameElement(frameEl)) {
        frameEl = null;
      }
    } catch (err) {
      frameEl = null;
      if (typeof errback === "function") {
        errback(this._cloneError(err));
      }
    }
    return frameEl;
  }

  private _isFrameElement = function(el) {
    let result;
    try {
      result = typeof el === "object" && el !== null && el.nodeType === 1 && /^I?FRAME$/.test(el.nodeName || "") && !!el.hasAttribute && !!el.getAttribute && !!el.setAttribute;
    } catch (err) {
      result = false;
    }
    return result;
  }

  private _isWindowFramed = function() {
    /*jshint eqeqeq:false */
    // Cannot compare WindowProxy objects with ===/!==
    let isNotChildWindow = !window.opener,
      hasWindowAncestors = !!(window.top && window != window.top || window.parent && window != window.parent);
    return isNotChildWindow && hasWindowAncestors;
  }

  private _slice = Array.prototype.slice;

  private _cloneError = function(err) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
  }

  private _union = function(arr1, arr2) {
    return (arr1 || []).concat(arr2 || []).filter(function(key, i, arr) {
      return arr.indexOf(key) === i;
    });
  }


  private _getEffectiveScriptOrigin = function(errback) {
    let effectiveScriptOrigin;
    try {
      effectiveScriptOrigin = document.domain || null;
    } catch (err) {
      effectiveScriptOrigin = null;
      if (typeof errback === "function") {
        errback(this._cloneError(err));
      }
    }
    return effectiveScriptOrigin;
  }

  private _defaultAllowancesMapForNullAllowances = function() {
    return {
      forms: null,
      modals: null,
      orientationLock: null,
      pointerLock: null,
      popups: null,
      popupsToEscapeSandbox: null,
      sameOrigin: true,
      scripts: true,
      topNavigation: null
    };
  }

  private _createAllowancesMap = function(allowancesString) {
    let allowanceList, allowancesMap = null;
    if (allowancesString === null) {
      allowancesMap = this._defaultAllowancesMapForNullAllowances();
    } else if (typeof allowancesString === "string") {
      allowanceList = allowancesString.replace(/^\s+|\s+$/g, "").toLowerCase().split(/\s+/);
      allowancesMap = {
        forms: allowanceList.indexOf("allow-forms") !== -1,
        modals: allowanceList.indexOf("allow-modals") !== -1,
        orientationLock: allowanceList.indexOf("allow-orientation-lock") !== -1,
        pointerLock: allowanceList.indexOf("allow-pointer-lock") !== -1,
        popups: allowanceList.indexOf("allow-popups") !== -1,
        popupsToEscapeSandbox: allowanceList.indexOf("allow-popups-to-escape-sandbox") !== -1,
        sameOrigin: allowanceList.indexOf("allow-same-origin") !== -1,
        scripts: allowanceList.indexOf("allow-scripts") !== -1,
        topNavigation: allowanceList.indexOf("allow-top-navigation") !== -1
      };
    }
    return allowancesMap;
  }

  private _sandboxAllowancesMatch = function(sbAllowances1, sbAllowances2) {
    let allUsedKeys, i, len, prop, allMatched = false;
    if (sbAllowances1 && typeof sbAllowances1 === "object" && sbAllowances2 && typeof sbAllowances2 === "object") {
      allUsedKeys = this._union(Object.keys(sbAllowances1), Object.keys(sbAllowances2));
      allMatched = true;
      for (i = 0, len = allUsedKeys.length; i < len; i++) {
        prop = allUsedKeys[i];
        if (!(sbAllowances1.hasOwnProperty(prop) && sbAllowances2.hasOwnProperty(prop) && sbAllowances1[prop] === sbAllowances2[prop])) {
          allMatched = false;
          break;
        }
      }
    }
    return allMatched;
  }




}

/**********************
 *                    *
 *   Export the API   *
 *                    *
 **********************/
export let sandblaster = new SandBlaster();
