"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.DirectLine = exports.ConnectionStatus = void 0;

var _objectWithoutProperties2 = _interopRequireDefault(require("@babel/runtime/helpers/objectWithoutProperties"));

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _BehaviorSubject = require("rxjs/BehaviorSubject");

var _Observable = require("rxjs/Observable");

require("rxjs/add/operator/catch");

require("rxjs/add/operator/combineLatest");

require("rxjs/add/operator/count");

require("rxjs/add/operator/delay");

require("rxjs/add/operator/do");

require("rxjs/add/operator/filter");

require("rxjs/add/operator/map");

require("rxjs/add/operator/mergeMap");

require("rxjs/add/operator/retryWhen");

require("rxjs/add/operator/share");

require("rxjs/add/operator/take");

require("rxjs/add/observable/dom/ajax");

require("rxjs/add/observable/empty");

require("rxjs/add/observable/from");

require("rxjs/add/observable/interval");

require("rxjs/add/observable/of");

require("rxjs/add/observable/throw");

var _dedupeFilenames = _interopRequireDefault(require("./dedupeFilenames"));

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { (0, _defineProperty2["default"])(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

var DIRECT_LINE_VERSION = 'DirectLine/3.0';
// These types are specific to this client library, not to Direct Line 3.0
var ConnectionStatus;
exports.ConnectionStatus = ConnectionStatus;

(function (ConnectionStatus) {
    ConnectionStatus[ConnectionStatus["Uninitialized"] = 0] = "Uninitialized";
    ConnectionStatus[ConnectionStatus["Connecting"] = 1] = "Connecting";
    ConnectionStatus[ConnectionStatus["Online"] = 2] = "Online";
    ConnectionStatus[ConnectionStatus["ExpiredToken"] = 3] = "ExpiredToken";
    ConnectionStatus[ConnectionStatus["FailedToConnect"] = 4] = "FailedToConnect";
    ConnectionStatus[ConnectionStatus["Ended"] = 5] = "Ended";
})(ConnectionStatus || (exports.ConnectionStatus = ConnectionStatus = {}));

var lifetimeRefreshToken = 30 * 60 * 1000;
var intervalRefreshToken = lifetimeRefreshToken / 2;
var timeout = 20 * 1000;
var retries = (lifetimeRefreshToken - intervalRefreshToken) / timeout;
var POLLING_INTERVAL_LOWER_BOUND = 200; //ms

var errorExpiredToken = new Error("expired token");
var errorConversationEnded = new Error("conversation ended");
var errorFailedToConnect = new Error("failed to connect");
var konsole = {
    log: function log(message) {
        var _console;

        for (var _len = arguments.length, optionalParams = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            optionalParams[_key - 1] = arguments[_key];
        }

        if (typeof window !== 'undefined' && window["botchatDebug"] && message) (_console = console).log.apply(_console, [message].concat(optionalParams));
    }
};

var DirectLine =
    /*#__PURE__*/
    function () {
        //ms
        function DirectLine(options) {
            (0, _classCallCheck2["default"])(this, DirectLine);
            (0, _defineProperty2["default"])(this, "connectionStatus$", new _BehaviorSubject.BehaviorSubject(ConnectionStatus.Uninitialized));
            (0, _defineProperty2["default"])(this, "activity$", void 0);
            (0, _defineProperty2["default"])(this, "domain", "https://directline.botframework.com/v3/directline");
            (0, _defineProperty2["default"])(this, "webSocket", void 0);
            (0, _defineProperty2["default"])(this, "conversationId", void 0);
            (0, _defineProperty2["default"])(this, "expiredTokenExhaustion", void 0);
            (0, _defineProperty2["default"])(this, "secret", void 0);
            (0, _defineProperty2["default"])(this, "token", void 0);
            (0, _defineProperty2["default"])(this, "watermark", '');
            (0, _defineProperty2["default"])(this, "streamUrl", void 0);
            (0, _defineProperty2["default"])(this, "_botAgent", '');
            (0, _defineProperty2["default"])(this, "_userAgent", void 0);
            (0, _defineProperty2["default"])(this, "referenceGrammarId", void 0);
            (0, _defineProperty2["default"])(this, "pollingInterval", 1000);
            (0, _defineProperty2["default"])(this, "tokenRefreshSubscription", void 0);
            this.secret = options.secret;
            this.token = options.secret || options.token;
            this.webSocket = (options.webSocket === undefined ? true : options.webSocket) && typeof WebSocket !== 'undefined' && WebSocket !== undefined;

            if (options.domain) {
                this.domain = options.domain;
            }

            if (options.conversationId) {
                this.conversationId = options.conversationId;
            }

            if (options.watermark) {
                this.watermark = options.watermark;
            }

            if (options.streamUrl) {
                if (options.token && options.conversationId) {
                    this.streamUrl = options.streamUrl;
                } else {
                    console.warn('DirectLineJS: streamUrl was ignored: you need to provide a token and a conversationid');
                }
            }

            this._botAgent = this.getBotAgent(options.botAgent);
            var parsedPollingInterval = ~~options.pollingInterval;

            if (parsedPollingInterval < POLLING_INTERVAL_LOWER_BOUND) {
                if (typeof options.pollingInterval !== 'undefined') {
                    console.warn("DirectLineJS: provided pollingInterval (".concat(options.pollingInterval, ") is under lower bound (200ms), using default of 1000ms"));
                }
            } else {
                this.pollingInterval = parsedPollingInterval;
            }

            this.expiredTokenExhaustion = this.setConnectionStatusFallback(ConnectionStatus.ExpiredToken, ConnectionStatus.FailedToConnect, 5);
            this.activity$ = (this.webSocket ? this.webSocketActivity$() : this.pollingGetActivity$()).share();
        } // Every time we're about to make a Direct Line REST call, we call this first to see check the current connection status.
        // Either throws an error (indicating an error state) or emits a null, indicating a (presumably) healthy connection


        (0, _createClass2["default"])(DirectLine, [{
            key: "checkConnection",
            value: function checkConnection() {
                var _this = this;

                var once = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
                var obs = this.connectionStatus$.flatMap(function (connectionStatus) {
                    if (connectionStatus === ConnectionStatus.Uninitialized) {
                        _this.connectionStatus$.next(ConnectionStatus.Connecting); //if token and streamUrl are defined it means reconnect has already been done. Skipping it.


                        if (_this.token && _this.streamUrl) {
                            _this.connectionStatus$.next(ConnectionStatus.Online);

                            return _Observable.Observable.of(connectionStatus);
                        } else {
                            return _this.startConversation()["do"](function (conversation) {
                                _this.conversationId = conversation.conversationId;
                                _this.token = _this.secret || conversation.token;
                                _this.streamUrl = conversation.streamUrl;
                                _this.referenceGrammarId = conversation.referenceGrammarId;
                                if (!_this.secret) _this.refreshTokenLoop();

                                _this.connectionStatus$.next(ConnectionStatus.Online);
                            }, function (error) {
                                _this.connectionStatus$.next(ConnectionStatus.FailedToConnect);
                            }).map(function (_) {
                                return connectionStatus;
                            });
                        }
                    } else {
                        return _Observable.Observable.of(connectionStatus);
                    }
                }).filter(function (connectionStatus) {
                    return connectionStatus != ConnectionStatus.Uninitialized && connectionStatus != ConnectionStatus.Connecting;
                }).flatMap(function (connectionStatus) {
                    switch (connectionStatus) {
                        case ConnectionStatus.Ended:
                            return _Observable.Observable["throw"](errorConversationEnded);

                        case ConnectionStatus.FailedToConnect:
                            return _Observable.Observable["throw"](errorFailedToConnect);

                        case ConnectionStatus.ExpiredToken:
                            return _Observable.Observable.of(connectionStatus);

                        default:
                            return _Observable.Observable.of(connectionStatus);
                    }
                });
                return once ? obs.take(1) : obs;
            }
        }, {
            key: "setConnectionStatusFallback",
            value: function setConnectionStatusFallback(connectionStatusFrom, connectionStatusTo) {
                var maxAttempts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 5;
                maxAttempts--;
                var attempts = 0;
                var currStatus = null;
                return function (status) {
                    if (status === connectionStatusFrom && currStatus === status && attempts >= maxAttempts) {
                        attempts = 0;
                        return connectionStatusTo;
                    }

                    attempts++;
                    currStatus = status;
                    return status;
                };
            }
        }, {
            key: "expiredToken",
            value: function expiredToken() {
                var connectionStatus = this.connectionStatus$.getValue();
                if (connectionStatus != ConnectionStatus.Ended && connectionStatus != ConnectionStatus.FailedToConnect) this.connectionStatus$.next(ConnectionStatus.ExpiredToken);
                var protectedConnectionStatus = this.expiredTokenExhaustion(this.connectionStatus$.getValue());
                this.connectionStatus$.next(protectedConnectionStatus);
            }
        }, {
            key: "startConversation",
            value: function startConversation() {
                //if conversationid is set here, it means we need to call the reconnect api, else it is a new conversation
                var url = this.conversationId ? "".concat(this.domain, "/conversations/").concat(this.conversationId, "?watermark=").concat(this.watermark) : "".concat(this.domain, "/conversations");
                var method = this.conversationId ? "GET" : "POST";
                return _Observable.Observable.ajax({
                    method: method,
                    url: url,
                    timeout: timeout,
                    headers: _objectSpread({
                        "Accept": "application/json"
                    }, this.commonHeaders())
                }) //      .do(ajaxResponse => konsole.log("conversation ajaxResponse", ajaxResponse.response))
                    .map(function (ajaxResponse) {
                        return ajaxResponse.response;
                    }).retryWhen(function (error$) {
                        return (// for now we deem 4xx and 5xx errors as unrecoverable
                            // for everything else (timeouts), retry for a while
                            error$.mergeMap(function (error) {
                                return error.status >= 400 && error.status < 600 ? _Observable.Observable["throw"](error) : _Observable.Observable.of(error);
                            }).delay(timeout).take(retries)
                        );
                    });
            }
        }, {
            key: "refreshTokenLoop",
            value: function refreshTokenLoop() {
                var _this2 = this;

                this.tokenRefreshSubscription = _Observable.Observable.interval(intervalRefreshToken).flatMap(function (_) {
                    return _this2.refreshToken();
                }).subscribe(function (token) {
                    konsole.log("refreshing token", token, "at", new Date());
                    _this2.token = token;
                });
            }
        }, {
            key: "refreshToken",
            value: function refreshToken() {
                var _this3 = this;

                return this.checkConnection(true).flatMap(function (_) {
                    return _Observable.Observable.ajax({
                        method: "POST",
                        url: "".concat(_this3.domain, "/tokens/refresh"),
                        timeout: timeout,
                        headers: _objectSpread({}, _this3.commonHeaders())
                    }).map(function (ajaxResponse) {
                        return ajaxResponse.response.token;
                    }).retryWhen(function (error$) {
                        return error$.mergeMap(function (error) {
                            if (error.status === 403) {
                                // if the token is expired there's no reason to keep trying
                                _this3.expiredToken();

                                return _Observable.Observable["throw"](error);
                            } else if (error.status === 404) {
                                // If the bot is gone, we should stop retrying
                                return _Observable.Observable["throw"](error);
                            }

                            return _Observable.Observable.of(error);
                        }).delay(timeout).take(retries);
                    });
                });
            }
        }, {
            key: "reconnect",
            value: function reconnect(conversation) {
                this.token = conversation.token;
                this.streamUrl = conversation.streamUrl;
                if (this.connectionStatus$.getValue() === ConnectionStatus.ExpiredToken) this.connectionStatus$.next(ConnectionStatus.Online);
            }
        }, {
            key: "end",
            value: function end() {
                if (this.tokenRefreshSubscription) this.tokenRefreshSubscription.unsubscribe();

                try {
                    this.connectionStatus$.next(ConnectionStatus.Ended);
                } catch (e) {
                    if (e === errorConversationEnded) return;
                    throw e;
                }
            }
        }, {
            key: "getSessionId",
            value: function getSessionId() {
                var _this4 = this;

                // If we're not connected to the bot, get connected
                // Will throw an error if we are not connected
                konsole.log("getSessionId");
                return this.checkConnection(true).flatMap(function (_) {
                    return _Observable.Observable.ajax({
                        method: "GET",
                        url: "".concat(_this4.domain, "/session/getsessionid"),
                        withCredentials: true,
                        timeout: timeout,
                        headers: _objectSpread({
                            "Content-Type": "application/json"
                        }, _this4.commonHeaders())
                    }).map(function (ajaxResponse) {
                        if (ajaxResponse && ajaxResponse.response && ajaxResponse.response.sessionId) {
                            konsole.log("getSessionId response: " + ajaxResponse.response.sessionId);
                            return ajaxResponse.response.sessionId;
                        }

                        return '';
                    })["catch"](function (error) {
                        konsole.log("getSessionId error: " + error.status);
                        return _Observable.Observable.of('');
                    });
                })["catch"](function (error) {
                    return _this4.catchExpiredToken(error);
                });
            }
        }, {
            key: "postActivity",
            value: function postActivity(activity) {
                var _this5 = this;

                // Use postMessageWithAttachments for messages with attachments that are local files (e.g. an image to upload)
                // Technically we could use it for *all* activities, but postActivity is much lighter weight
                // So, since WebChat is partially a reference implementation of Direct Line, we implement both.
                if (activity.type === "message" && activity.attachments && activity.attachments.length > 0) return this.postMessageWithAttachments(activity); // If we're not connected to the bot, get connected
                // Will throw an error if we are not connected

                konsole.log("postActivity", activity);
                return this.checkConnection(true).flatMap(function (_) {
                    return _Observable.Observable.ajax({
                        method: "POST",
                        url: "".concat(_this5.domain, "/conversations/").concat(_this5.conversationId, "/activities"),
                        body: activity,
                        timeout: timeout,
                        headers: _objectSpread({
                            "Content-Type": "application/json"
                        }, _this5.commonHeaders())
                    }).map(function (ajaxResponse) {
                        return ajaxResponse.response.id;
                    })["catch"](function (error) {
                        return _this5.catchPostError(error);
                    });
                })["catch"](function (error) {
                    return _this5.catchExpiredToken(error);
                });
            }
        }, {
            key: "postMessageWithAttachments",
            value: function postMessageWithAttachments(message) {
                var _this6 = this;

                var attachments = message.attachments; // We clean the attachments but making sure every attachment has unique name.
                // If the file do not have a name, Chrome will assign "blob" when it is appended to FormData.

                var attachmentNames = (0, _dedupeFilenames["default"])(attachments.map(function (media) {
                    return media.name || 'blob';
                }));
                var cleansedAttachments = attachments.map(function (attachment, index) {
                    return _objectSpread({}, attachment, {
                        name: attachmentNames[index]
                    });
                });
                var formData; // If we're not connected to the bot, get connected
                // Will throw an error if we are not connected

                return this.checkConnection(true).flatMap(function (_) {
                    // To send this message to DirectLine we need to deconstruct it into a "template" activity
                    // and one blob for each attachment.
                    formData = new FormData();
                    formData.append('activity', new Blob([JSON.stringify(_objectSpread({}, message, {
                        // Removing contentUrl from attachment, we will send it via multipart
                        attachments: cleansedAttachments.map(function (_ref) {
                            var string = _ref.contentUrl,
                                others = (0, _objectWithoutProperties2["default"])(_ref, ["contentUrl"]);
                            return _objectSpread({}, others);
                        })
                    }))], {
                        type: 'application/vnd.microsoft.activity'
                    }));
                    return _Observable.Observable.from(cleansedAttachments).flatMap(function (media) {
                        return _Observable.Observable.ajax({
                            method: "GET",
                            url: media.contentUrl,
                            responseType: 'arraybuffer'
                        })["do"](function (ajaxResponse) {
                            return formData.append('file', new Blob([ajaxResponse.response], {
                                type: media.contentType
                            }), media.name);
                        });
                    }).count();
                }).flatMap(function (_) {
                    return _Observable.Observable.ajax({
                        method: "POST",
                        url: "".concat(_this6.domain, "/conversations/").concat(_this6.conversationId, "/upload?userId=").concat(message.from.id),
                        body: formData,
                        timeout: timeout,
                        headers: _objectSpread({}, _this6.commonHeaders())
                    }).map(function (ajaxResponse) {
                        return ajaxResponse.response.id;
                    })["catch"](function (error) {
                        return _this6.catchPostError(error);
                    });
                })["catch"](function (error) {
                    return _this6.catchPostError(error);
                });
            }
        }, {
            key: "catchPostError",
            value: function catchPostError(error) {
                if (error.status === 403) // token has expired (will fall through to return "retry")
                    this.expiredToken(); else if (error.status >= 400 && error.status < 500) // more unrecoverable errors
                    return _Observable.Observable["throw"](error);
                return _Observable.Observable.of("retry");
            }
        }, {
            key: "catchExpiredToken",
            value: function catchExpiredToken(error) {
                return error === errorExpiredToken ? _Observable.Observable.of("retry") : _Observable.Observable["throw"](error);
            }
        }, {
            key: "pollingGetActivity$",
            value: function pollingGetActivity$() {
                var _this7 = this;

                var poller$ = _Observable.Observable.create(function (subscriber) {
                    // A BehaviorSubject to trigger polling. Since it is a BehaviorSubject
                    // the first event is produced immediately.
                    var trigger$ = new _BehaviorSubject.BehaviorSubject({});
                    trigger$.subscribe(function () {
                        if (_this7.connectionStatus$.getValue() === ConnectionStatus.Online) {
                            var startTimestamp = Date.now();

                            _Observable.Observable.ajax({
                                headers: _objectSpread({
                                    Accept: 'application/json'
                                }, _this7.commonHeaders()),
                                method: 'GET',
                                url: "".concat(_this7.domain, "/conversations/").concat(_this7.conversationId, "/activities?watermark=").concat(_this7.watermark),
                                timeout: timeout
                            }).subscribe(function (result) {
                                subscriber.next(result);
                                setTimeout(function () {
                                    return trigger$.next(null);
                                }, Math.max(0, _this7.pollingInterval - Date.now() + startTimestamp));
                            }, function (error) {
                                switch (error.status) {
                                    case 403:
                                        _this7.connectionStatus$.next(ConnectionStatus.ExpiredToken);

                                        setTimeout(function () {
                                            return trigger$.next(null);
                                        }, _this7.pollingInterval);
                                        break;

                                    case 404:
                                        _this7.connectionStatus$.next(ConnectionStatus.Ended);

                                        break;

                                    default:
                                        // propagate the error
                                        subscriber.error(error);
                                        break;
                                }
                            });
                        }
                    });
                });

                return this.checkConnection().flatMap(function (_) {
                    return poller$["catch"](function () {
                        return _Observable.Observable.empty();
                    }).map(function (ajaxResponse) {
                        return ajaxResponse.response;
                    }).flatMap(function (activityGroup) {
                        return _this7.observableFromActivityGroup(activityGroup);
                    });
                });
            }
        }, {
            key: "observableFromActivityGroup",
            value: function observableFromActivityGroup(activityGroup) {
                if (activityGroup.watermark) this.watermark = activityGroup.watermark;
                return _Observable.Observable.from(activityGroup.activities);
            }
        }, {
            key: "webSocketActivity$",
            value: function webSocketActivity$() {
                var _this8 = this;

                return this.checkConnection().flatMap(function (_) {
                    return _this8.observableWebSocket() // WebSockets can be closed by the server or the browser. In the former case we need to
                        // retrieve a new streamUrl. In the latter case we could first retry with the current streamUrl,
                        // but it's simpler just to always fetch a new one.
                        .retryWhen(function (error$) {
                            return error$.delay(_this8.getRetryDelay()).mergeMap(function (error) {
                                return _this8.reconnectToConversation();
                            });
                        });
                }).flatMap(function (activityGroup) {
                    return _this8.observableFromActivityGroup(activityGroup);
                });
            } // Returns the delay duration in milliseconds

        }, {
            key: "getRetryDelay",
            value: function getRetryDelay() {
                return Math.floor(3000 + Math.random() * 12000);
            } // Originally we used Observable.webSocket, but it's fairly opionated  and I ended up writing
            // a lot of code to work around their implemention details. Since WebChat is meant to be a reference
            // implementation, I decided roll the below, where the logic is more purposeful. - @billba

        }, {
            key: "observableWebSocket",
            value: function observableWebSocket() {
                var _this9 = this;

                return _Observable.Observable.create(function (subscriber) {
                    konsole.log("creating WebSocket", _this9.streamUrl);
                    var ws = new WebSocket(_this9.streamUrl);
                    var sub;

                    ws.onopen = function (open) {
                        konsole.log("WebSocket open", open); // Chrome is pretty bad at noticing when a WebSocket connection is broken.
                        // If we periodically ping the server with empty messages, it helps Chrome
                        // realize when connection breaks, and close the socket. We then throw an
                        // error, and that give us the opportunity to attempt to reconnect.

                        sub = _Observable.Observable.interval(timeout).subscribe(function (_) {
                            try {
                                ws.send("");
                            } catch (e) {
                                konsole.log("Ping error", e);
                            }
                        });
                    };

                    ws.onclose = function (close) {
                        konsole.log("WebSocket close", close);
                        if (sub) sub.unsubscribe();
                        subscriber.error(close);
                    };

                    ws.onmessage = function (message) {
                        return message.data && subscriber.next(JSON.parse(message.data));
                    }; // This is the 'unsubscribe' method, which is called when this observable is disposed.
                    // When the WebSocket closes itself, we throw an error, and this function is eventually called.
                    // When the observable is closed first (e.g. when tearing down a WebChat instance) then
                    // we need to manually close the WebSocket.


                    return function () {
                        if (ws.readyState === 0 || ws.readyState === 1) ws.close();
                    };
                });
            }
        }, {
            key: "reconnectToConversation",
            value: function reconnectToConversation() {
                var _this10 = this;

                return this.checkConnection(true).flatMap(function (_) {
                    return _Observable.Observable.ajax({
                        method: "GET",
                        url: "".concat(_this10.domain, "/conversations/").concat(_this10.conversationId, "?watermark=").concat(_this10.watermark),
                        timeout: timeout,
                        headers: _objectSpread({
                            "Accept": "application/json"
                        }, _this10.commonHeaders())
                    })["do"](function (result) {
                        if (!_this10.secret) _this10.token = result.response.token;
                        _this10.streamUrl = result.response.streamUrl;
                    }).map(function (_) {
                        return null;
                    }).retryWhen(function (error$) {
                        return error$.mergeMap(function (error) {
                            if (error.status === 403) {
                                // token has expired. We can't recover from this here, but the embedding
                                // website might eventually call reconnect() with a new token and streamUrl.
                                _this10.expiredToken();
                            } else if (error.status === 404) {
                                return _Observable.Observable["throw"](errorConversationEnded);
                            }

                            return _Observable.Observable.of(error);
                        }).delay(timeout).take(retries);
                    });
                });
            }
        }, {
            key: "commonHeaders",
            value: function commonHeaders() {
                return {
                    "Authorization": "Bearer ".concat(this.token),
                    "x-ms-bot-agent": this._botAgent
                };
            }
        }, {
            key: "getBotAgent",
            value: function getBotAgent() {
                var customAgent = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
                var clientAgent = 'directlinejs';

                if (customAgent) {
                    clientAgent += "; ".concat(customAgent);
                }

                return "".concat(DIRECT_LINE_VERSION, " (").concat(clientAgent, ")");
            }
        }]);
        return DirectLine;
    }();

exports.DirectLine = DirectLine;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9kaXJlY3RMaW5lLnRzIl0sIm5hbWVzIjpbIkRJUkVDVF9MSU5FX1ZFUlNJT04iLCJDb25uZWN0aW9uU3RhdHVzIiwibGlmZXRpbWVSZWZyZXNoVG9rZW4iLCJpbnRlcnZhbFJlZnJlc2hUb2tlbiIsInRpbWVvdXQiLCJyZXRyaWVzIiwiUE9MTElOR19JTlRFUlZBTF9MT1dFUl9CT1VORCIsImVycm9yRXhwaXJlZFRva2VuIiwiRXJyb3IiLCJlcnJvckNvbnZlcnNhdGlvbkVuZGVkIiwiZXJyb3JGYWlsZWRUb0Nvbm5lY3QiLCJrb25zb2xlIiwibG9nIiwibWVzc2FnZSIsIm9wdGlvbmFsUGFyYW1zIiwid2luZG93IiwiY29uc29sZSIsIkRpcmVjdExpbmUiLCJvcHRpb25zIiwiQmVoYXZpb3JTdWJqZWN0IiwiVW5pbml0aWFsaXplZCIsInNlY3JldCIsInRva2VuIiwid2ViU29ja2V0IiwidW5kZWZpbmVkIiwiV2ViU29ja2V0IiwiZG9tYWluIiwiY29udmVyc2F0aW9uSWQiLCJ3YXRlcm1hcmsiLCJzdHJlYW1VcmwiLCJ3YXJuIiwiX2JvdEFnZW50IiwiZ2V0Qm90QWdlbnQiLCJib3RBZ2VudCIsInBhcnNlZFBvbGxpbmdJbnRlcnZhbCIsInBvbGxpbmdJbnRlcnZhbCIsImV4cGlyZWRUb2tlbkV4aGF1c3Rpb24iLCJzZXRDb25uZWN0aW9uU3RhdHVzRmFsbGJhY2siLCJFeHBpcmVkVG9rZW4iLCJGYWlsZWRUb0Nvbm5lY3QiLCJhY3Rpdml0eSQiLCJ3ZWJTb2NrZXRBY3Rpdml0eSQiLCJwb2xsaW5nR2V0QWN0aXZpdHkkIiwic2hhcmUiLCJvbmNlIiwib2JzIiwiY29ubmVjdGlvblN0YXR1cyQiLCJmbGF0TWFwIiwiY29ubmVjdGlvblN0YXR1cyIsIm5leHQiLCJDb25uZWN0aW5nIiwiT25saW5lIiwiT2JzZXJ2YWJsZSIsIm9mIiwic3RhcnRDb252ZXJzYXRpb24iLCJjb252ZXJzYXRpb24iLCJyZWZlcmVuY2VHcmFtbWFySWQiLCJyZWZyZXNoVG9rZW5Mb29wIiwiZXJyb3IiLCJtYXAiLCJfIiwiZmlsdGVyIiwiRW5kZWQiLCJ0YWtlIiwiY29ubmVjdGlvblN0YXR1c0Zyb20iLCJjb25uZWN0aW9uU3RhdHVzVG8iLCJtYXhBdHRlbXB0cyIsImF0dGVtcHRzIiwiY3VyclN0YXR1cyIsInN0YXR1cyIsImdldFZhbHVlIiwicHJvdGVjdGVkQ29ubmVjdGlvblN0YXR1cyIsInVybCIsIm1ldGhvZCIsImFqYXgiLCJoZWFkZXJzIiwiY29tbW9uSGVhZGVycyIsImFqYXhSZXNwb25zZSIsInJlc3BvbnNlIiwicmV0cnlXaGVuIiwiZXJyb3IkIiwibWVyZ2VNYXAiLCJkZWxheSIsInRva2VuUmVmcmVzaFN1YnNjcmlwdGlvbiIsImludGVydmFsIiwicmVmcmVzaFRva2VuIiwic3Vic2NyaWJlIiwiRGF0ZSIsImNoZWNrQ29ubmVjdGlvbiIsImV4cGlyZWRUb2tlbiIsInVuc3Vic2NyaWJlIiwiZSIsIndpdGhDcmVkZW50aWFscyIsInNlc3Npb25JZCIsImNhdGNoRXhwaXJlZFRva2VuIiwiYWN0aXZpdHkiLCJ0eXBlIiwiYXR0YWNobWVudHMiLCJsZW5ndGgiLCJwb3N0TWVzc2FnZVdpdGhBdHRhY2htZW50cyIsImJvZHkiLCJpZCIsImNhdGNoUG9zdEVycm9yIiwiYXR0YWNobWVudE5hbWVzIiwibWVkaWEiLCJuYW1lIiwiY2xlYW5zZWRBdHRhY2htZW50cyIsImF0dGFjaG1lbnQiLCJpbmRleCIsImZvcm1EYXRhIiwiRm9ybURhdGEiLCJhcHBlbmQiLCJCbG9iIiwiSlNPTiIsInN0cmluZ2lmeSIsInN0cmluZyIsImNvbnRlbnRVcmwiLCJvdGhlcnMiLCJmcm9tIiwicmVzcG9uc2VUeXBlIiwiY29udGVudFR5cGUiLCJjb3VudCIsInBvbGxlciQiLCJjcmVhdGUiLCJzdWJzY3JpYmVyIiwidHJpZ2dlciQiLCJzdGFydFRpbWVzdGFtcCIsIm5vdyIsIkFjY2VwdCIsInJlc3VsdCIsInNldFRpbWVvdXQiLCJNYXRoIiwibWF4IiwiZW1wdHkiLCJhY3Rpdml0eUdyb3VwIiwib2JzZXJ2YWJsZUZyb21BY3Rpdml0eUdyb3VwIiwiYWN0aXZpdGllcyIsIm9ic2VydmFibGVXZWJTb2NrZXQiLCJnZXRSZXRyeURlbGF5IiwicmVjb25uZWN0VG9Db252ZXJzYXRpb24iLCJmbG9vciIsInJhbmRvbSIsIndzIiwic3ViIiwib25vcGVuIiwib3BlbiIsInNlbmQiLCJvbmNsb3NlIiwiY2xvc2UiLCJvbm1lc3NhZ2UiLCJkYXRhIiwicGFyc2UiLCJyZWFkeVN0YXRlIiwiY3VzdG9tQWdlbnQiLCJjbGllbnRBZ2VudCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQTs7QUFDQTs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFFQTs7Ozs7O0FBRUEsSUFBTUEsbUJBQW1CLEdBQUcsZ0JBQTVCO0FBdVRBO0lBRVlDLGdCOzs7V0FBQUEsZ0I7QUFBQUEsRUFBQUEsZ0IsQ0FBQUEsZ0I7QUFBQUEsRUFBQUEsZ0IsQ0FBQUEsZ0I7QUFBQUEsRUFBQUEsZ0IsQ0FBQUEsZ0I7QUFBQUEsRUFBQUEsZ0IsQ0FBQUEsZ0I7QUFBQUEsRUFBQUEsZ0IsQ0FBQUEsZ0I7QUFBQUEsRUFBQUEsZ0IsQ0FBQUEsZ0I7R0FBQUEsZ0IsZ0NBQUFBLGdCOztBQXNCWixJQUFNQyxvQkFBb0IsR0FBRyxLQUFLLEVBQUwsR0FBVSxJQUF2QztBQUNBLElBQU1DLG9CQUFvQixHQUFHRCxvQkFBb0IsR0FBRyxDQUFwRDtBQUNBLElBQU1FLE9BQU8sR0FBRyxLQUFLLElBQXJCO0FBQ0EsSUFBTUMsT0FBTyxHQUFHLENBQUNILG9CQUFvQixHQUFHQyxvQkFBeEIsSUFBZ0RDLE9BQWhFO0FBRUEsSUFBTUUsNEJBQW9DLEdBQUcsR0FBN0MsQyxDQUFrRDs7QUFFbEQsSUFBTUMsaUJBQWlCLEdBQUcsSUFBSUMsS0FBSixDQUFVLGVBQVYsQ0FBMUI7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QU4sS0FBaUIsR0FBckIsRUFBMEI7QUFDdEI7QUFDQTtBQUNBLGNBQUEsT0FBSSxDQUFDb0IsWUFBTDtBQUNILGFBSkQsTUFJTyxJQUFJL0IsS0FBSyxDQUFDVyxNQUFOLEtBQWlCLEdBQXJCLEVBQTBCO0FBQzdCLHFCQUFPakIsZ0NBQWlCM0Msc0JBQWpCLENBQVA7QUFDSDs7QUFFRCxtQkFBTzJDLHVCQUFXQyxFQUFYLENBQWNLLEtBQWQsQ0FBUDtBQUNILFdBWGdCLEVBWWhCd0IsS0FaZ0IsQ0FZVjlFLE9BWlUsRUFhaEIyRCxJQWJnQixDQWFYMUQsT0FiVyxDQUFKO0FBQUEsU0FmakIsQ0FETTtBQUFBLE9BREgsQ0FBUDtBQWlDSDs7O29DQUV1QjtBQUNwQixhQUFPO0FBQ0gsMENBQTJCLEtBQUtpQixLQUFoQyxDQURHO0FBRUgsMEJBQWtCLEtBQUtTO0FBRnBCLE9BQVA7QUFJSDs7O2tDQUVxRDtBQUFBLFVBQWxDMEgsV0FBa0MsdUVBQVosRUFBWTtBQUNsRCxVQUFJQyxXQUFXLEdBQUcsY0FBbEI7O0FBRUEsVUFBSUQsV0FBSixFQUFpQjtBQUNiQyxRQUFBQSxXQUFXLGdCQUFTRCxXQUFULENBQVg7QUFDSDs7QUFFRCx1QkFBVXpKLG1CQUFWLGVBQWtDMEosV0FBbEM7QUFDSCIsInNvdXJjZXNDb250ZW50IjpbIi8vIEluIG9yZGVyIHRvIGtlZXAgZmlsZSBzaXplIGRvd24sIG9ubHkgaW1wb3J0IHRoZSBwYXJ0cyBvZiByeGpzIHRoYXQgd2UgdXNlXG5cbmltcG9ydCB7IEFqYXhSZXNwb25zZSwgQWpheFJlcXVlc3QgfSBmcm9tICdyeGpzL29ic2VydmFibGUvZG9tL0FqYXhPYnNlcnZhYmxlJztcbmltcG9ydCB7IEJlaGF2aW9yU3ViamVjdCB9IGZyb20gJ3J4anMvQmVoYXZpb3JTdWJqZWN0JztcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICdyeGpzL09ic2VydmFibGUnO1xuaW1wb3J0IHsgU3Vic2NyaWJlciB9IGZyb20gJ3J4anMvU3Vic2NyaWJlcic7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICdyeGpzL1N1YnNjcmlwdGlvbic7XG5cbmltcG9ydCAncnhqcy9hZGQvb3BlcmF0b3IvY2F0Y2gnO1xuaW1wb3J0ICdyeGpzL2FkZC9vcGVyYXRvci9jb21iaW5lTGF0ZXN0JztcbmltcG9ydCAncnhqcy9hZGQvb3BlcmF0b3IvY291bnQnO1xuaW1wb3J0ICdyeGpzL2FkZC9vcGVyYXRvci9kZWxheSc7XG5pbXBvcnQgJ3J4anMvYWRkL29wZXJhdG9yL2RvJztcbmltcG9ydCAncnhqcy9hZGQvb3BlcmF0b3IvZmlsdGVyJztcbmltcG9ydCAncnhqcy9hZGQvb3BlcmF0b3IvbWFwJztcbmltcG9ydCAncnhqcy9hZGQvb3BlcmF0b3IvbWVyZ2VNYXAnO1xuaW1wb3J0ICdyeGpzL2FkZC9vcGVyYXRvci9yZXRyeVdoZW4nO1xuaW1wb3J0ICdyeGpzL2FkZC9vcGVyYXRvci9zaGFyZSc7XG5pbXBvcnQgJ3J4anMvYWRkL29wZXJhdG9yL3Rha2UnO1xuXG5pbXBvcnQgJ3J4anMvYWRkL29ic2VydmFibGUvZG9tL2FqYXgnO1xuaW1wb3J0ICdyeGpzL2FkZC9vYnNlcnZhYmxlL2VtcHR5JztcbmltcG9ydCAncnhqcy9hZGQvb2JzZXJ2YWJsZS9mcm9tJztcbmltcG9ydCAncnhqcy9hZGQvb2JzZXJ2YWJsZS9pbnRlcnZhbCc7XG5pbXBvcnQgJ3J4anMvYWRkL29ic2VydmFibGUvb2YnO1xuaW1wb3J0ICdyeGpzL2FkZC9vYnNlcnZhYmxlL3Rocm93JztcblxuaW1wb3J0IGRlZHVwZUZpbGVuYW1lcyBmcm9tICcuL2RlZHVwZUZpbGVuYW1lcyc7XG5cbmNvbnN0IERJUkVDVF9MSU5FX1ZFUlNJT04gPSAnRGlyZWN0TGluZS8zLjAnO1xuXG5kZWNsYXJlIHZhciBwcm9jZXNzOiB7XG4gICAgYXJjaDogc3RyaW5nO1xuICAgIGVudjoge1xuICAgICAgICBWRVJTSU9OOiBzdHJpbmc7XG4gICAgfTtcbiAgICBwbGF0Zm9ybTogc3RyaW5nO1xuICAgIHJlbGVhc2U6IHN0cmluZztcbiAgICB2ZXJzaW9uOiBzdHJpbmc7XG59O1xuXG4vLyBEaXJlY3QgTGluZSAzLjAgdHlwZXNcblxuZXhwb3J0IGludGVyZmFjZSBDb252ZXJzYXRpb24ge1xuICAgIGNvbnZlcnNhdGlvbklkOiBzdHJpbmcsXG4gICAgdG9rZW46IHN0cmluZyxcbiAgICBlVGFnPzogc3RyaW5nLFxuICAgIHN0cmVhbVVybD86IHN0cmluZyxcbiAgICByZWZlcmVuY2VHcmFtbWFySWQ/OiBzdHJpbmdcbn1cblxuZXhwb3J0IHR5cGUgTWVkaWFUeXBlID0gXCJpbWFnZS9wbmdcIiB8IFwiaW1hZ2UvanBnXCIgfCBcImltYWdlL2pwZWdcIiB8IFwiaW1hZ2UvZ2lmXCIgfCBcImltYWdlL3N2Zyt4bWxcIiB8IFwiYXVkaW8vbXBlZ1wiIHwgXCJhdWRpby9tcDRcIiB8IFwidmlkZW8vbXA0XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWVkaWEge1xuICAgIGNvbnRlbnRUeXBlOiBNZWRpYVR5cGUsXG4gICAgY29udGVudFVybDogc3RyaW5nLFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgdGh1bWJuYWlsVXJsPzogc3RyaW5nXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVW5rbm93bk1lZGlhe1xuICAgIGNvbnRlbnRUeXBlOiBzdHJpbmcsXG4gICAgY29udGVudFVybDogc3RyaW5nLFxuICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgdGh1bWJuYWlsVXJsPzogc3RyaW5nXG59XG5cbmV4cG9ydCB0eXBlIENhcmRBY3Rpb25UeXBlcyA9IFwiY2FsbFwiIHwgXCJkb3dubG9hZEZpbGVcInwgXCJpbUJhY2tcIiB8IFwibWVzc2FnZUJhY2tcIiB8IFwib3BlblVybFwiIHwgXCJwbGF5QXVkaW9cIiB8IFwicGxheVZpZGVvXCIgfCBcInBvc3RCYWNrXCIgfCBcInNpZ25pblwiIHwgXCJzaG93SW1hZ2VcIjtcblxuZXhwb3J0IHR5cGUgQ2FyZEFjdGlvbiA9IENhbGxDYXJkQWN0aW9uIHwgRG93bmxvYWRGaWxlQ2FyZEFjdGlvbiB8IElNQmFja0NhcmRBY3Rpb24gfCBNZXNzYWdlQmFja0NhcmRBY3Rpb24gfCBPcGVuVVJMQ2FyZEFjdGlvbiB8IFBsYXlBdWRpb0NhcmRBY3Rpb24gfCBQbGF5VmlkZW9DYXJkQWN0aW9uIHwgUG9zdEJhY2tDYXJkQWN0aW9uIHwgU2lnbkluQ2FyZEFjdGlvbiB8IFNob3dJbWFnZUNhcmRBY3Rpb247XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FsbENhcmRBY3Rpb24ge1xuICAgIGltYWdlPzogc3RyaW5nLFxuICAgIHRpdGxlOiBzdHJpbmcsXG4gICAgdHlwZTogXCJjYWxsXCIsXG4gICAgdmFsdWU6IGFueVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIERvd25sb2FkRmlsZUNhcmRBY3Rpb24ge1xuICAgIGltYWdlPzogc3RyaW5nLFxuICAgIHRpdGxlOiBzdHJpbmcsXG4gICAgdHlwZTogXCJkb3dubG9hZEZpbGVcIixcbiAgICB2YWx1ZTogYW55XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1CYWNrQ2FyZEFjdGlvbiB7XG4gICAgaW1hZ2U/OiBzdHJpbmcsXG4gICAgdGl0bGU/OiBzdHJpbmcsXG4gICAgdHlwZTogXCJpbUJhY2tcIixcbiAgICB2YWx1ZTogc3RyaW5nXG59XG5cbmV4cG9ydCB0eXBlIE1lc3NhZ2VCYWNrQ2FyZEFjdGlvbiA9IE1lc3NhZ2VCYWNrV2l0aEltYWdlIHwgTWVzc2FnZUJhY2tXaXRoVGl0bGVcblxuZXhwb3J0IGludGVyZmFjZSBNZXNzYWdlQmFja1dpdGhJbWFnZSB7XG4gICAgZGlzcGxheVRleHQ/OiBzdHJpbmcsXG4gICAgaW1hZ2U6IHN0cmluZyxcbiAgICB0ZXh0Pzogc3RyaW5nLFxuICAgIHRpdGxlPzogc3RyaW5nLFxuICAgIHR5cGU6IFwibWVzc2FnZUJhY2tcIixcbiAgICB2YWx1ZT86IGFueVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1lc3NhZ2VCYWNrV2l0aFRpdGxlIHtcbiAgICBkaXNwbGF5VGV4dD86IHN0cmluZyxcbiAgICBpbWFnZT86IHN0cmluZyxcbiAgICB0ZXh0Pzogc3RyaW5nLFxuICAgIHRpdGxlOiBzdHJpbmcsXG4gICAgdHlwZTogXCJtZXNzYWdlQmFja1wiLFxuICAgIHZhbHVlPzogYW55XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3BlblVSTENhcmRBY3Rpb24ge1xuICAgIGltYWdlPzogc3RyaW5nLFxuICAgIHRpdGxlOiBzdHJpbmcsXG4gICAgdHlwZTogXCJvcGVuVXJsXCIsXG4gICAgdmFsdWU6IGFueVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYXlBdWRpb0NhcmRBY3Rpb24ge1xuICAgIGltYWdlPzogc3RyaW5nLFxuICAgIHRpdGxlOiBzdHJpbmcsXG4gICAgdHlwZTogXCJwbGF5QXVkaW9cIixcbiAgICB2YWx1ZTogYW55XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxheVZpZGVvQ2FyZEFjdGlvbiB7XG4gICAgaW1hZ2U/OiBzdHJpbmcsXG4gICAgdGl0bGU6IHN0cmluZyxcbiAgICB0eXBlOiBcInBsYXlWaWRlb1wiLFxuICAgIHZhbHVlOiBhbnlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQb3N0QmFja0NhcmRBY3Rpb24ge1xuICAgIGltYWdlPzogc3RyaW5nLFxuICAgIHRpdGxlPzogc3RyaW5nLFxuICAgIHR5cGU6IFwicG9zdEJhY2tcIixcbiAgICB2YWx1ZTogYW55XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hvd0ltYWdlQ2FyZEFjdGlvbiB7XG4gICAgaW1hZ2U/OiBzdHJpbmcsXG4gICAgdGl0bGU6IHN0cmluZyxcbiAgICB0eXBlOiBcInNob3dJbWFnZVwiLFxuICAgIHZhbHVlOiBhbnlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaWduSW5DYXJkQWN0aW9uIHtcbiAgICBpbWFnZT86IHN0cmluZyxcbiAgICB0aXRsZTogc3RyaW5nLFxuICAgIHR5cGU6IFwic2lnbmluXCIsXG4gICAgdmFsdWU6IGFueVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENhcmRJbWFnZSB7XG4gICAgYWx0Pzogc3RyaW5nLFxuICAgIHVybDogc3RyaW5nLFxuICAgIHRhcD86IENhcmRBY3Rpb25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZXJvQ2FyZCB7XG4gICAgY29udGVudFR5cGU6IFwiYXBwbGljYXRpb24vdm5kLm1pY3Jvc29mdC5jYXJkLmhlcm9cIixcbiAgICBjb250ZW50OiB7XG4gICAgICAgIHRpdGxlPzogc3RyaW5nLFxuICAgICAgICBzdWJ0aXRsZT86IHN0cmluZyxcbiAgICAgICAgdGV4dD86IHN0cmluZyxcbiAgICAgICAgaW1hZ2VzPzogQ2FyZEltYWdlW10sXG4gICAgICAgIGJ1dHRvbnM/OiBDYXJkQWN0aW9uW10sXG4gICAgICAgIHRhcD86IENhcmRBY3Rpb25cbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGh1bWJuYWlsIHtcbiAgICBjb250ZW50VHlwZTogXCJhcHBsaWNhdGlvbi92bmQubWljcm9zb2Z0LmNhcmQudGh1bWJuYWlsXCIsXG4gICAgY29udGVudDoge1xuICAgICAgICB0aXRsZT86IHN0cmluZyxcbiAgICAgICAgc3VidGl0bGU/OiBzdHJpbmcsXG4gICAgICAgIHRleHQ/OiBzdHJpbmcsXG4gICAgICAgIGltYWdlcz86IENhcmRJbWFnZVtdLFxuICAgICAgICBidXR0b25zPzogQ2FyZEFjdGlvbltdLFxuICAgICAgICB0YXA/OiBDYXJkQWN0aW9uXG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNpZ25pbiB7XG4gICAgY29udGVudFR5cGU6IFwiYXBwbGljYXRpb24vdm5kLm1pY3Jvc29mdC5jYXJkLnNpZ25pblwiLFxuICAgIGNvbnRlbnQ6IHtcbiAgICAgICAgdGV4dD86IHN0cmluZyxcbiAgICAgICAgYnV0dG9ucz86IENhcmRBY3Rpb25bXVxuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBPQXV0aCB7XG4gICAgY29udGVudFR5cGU6IFwiYXBwbGljYXRpb24vdm5kLm1pY3Jvc29mdC5jYXJkLm9hdXRoXCIsXG4gICAgY29udGVudDoge1xuICAgICAgICB0ZXh0Pzogc3RyaW5nLFxuICAgICAgICBjb25uZWN0aW9ubmFtZTogc3RyaW5nLFxuICAgICAgICBidXR0b25zPzogQ2FyZEFjdGlvbltdXG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlY2VpcHRJdGVtIHtcbiAgICB0aXRsZT86IHN0cmluZyxcbiAgICBzdWJ0aXRsZT86IHN0cmluZyxcbiAgICB0ZXh0Pzogc3RyaW5nLFxuICAgIGltYWdlPzogQ2FyZEltYWdlLFxuICAgIHByaWNlPzogc3RyaW5nLFxuICAgIHF1YW50aXR5Pzogc3RyaW5nLFxuICAgIHRhcD86IENhcmRBY3Rpb25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWNlaXB0IHtcbiAgICBjb250ZW50VHlwZTogXCJhcHBsaWNhdGlvbi92bmQubWljcm9zb2Z0LmNhcmQucmVjZWlwdFwiLFxuICAgIGNvbnRlbnQ6IHtcbiAgICAgICAgdGl0bGU/OiBzdHJpbmcsXG4gICAgICAgIGZhY3RzPzogeyBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyB9W10sXG4gICAgICAgIGl0ZW1zPzogUmVjZWlwdEl0ZW1bXSxcbiAgICAgICAgdGFwPzogQ2FyZEFjdGlvbixcbiAgICAgICAgdGF4Pzogc3RyaW5nLFxuICAgICAgICB2YXQ/OiBzdHJpbmcsXG4gICAgICAgIHRvdGFsPzogc3RyaW5nLFxuICAgICAgICBidXR0b25zPzogQ2FyZEFjdGlvbltdXG4gICAgfVxufVxuXG4vLyBEZXByZWNhdGVkIGZvcm1hdCBmb3IgU2t5cGUgY2hhbm5lbHMuIEZvciB0ZXN0aW5nIGxlZ2FjeSBib3RzIGluIEVtdWxhdG9yIG9ubHkuXG5leHBvcnQgaW50ZXJmYWNlIEZsZXhDYXJkIHtcbiAgICBjb250ZW50VHlwZTogXCJhcHBsaWNhdGlvbi92bmQubWljcm9zb2Z0LmNhcmQuZmxleFwiLFxuICAgIGNvbnRlbnQ6IHtcbiAgICAgICAgdGl0bGU/OiBzdHJpbmcsXG4gICAgICAgIHN1YnRpdGxlPzogc3RyaW5nLFxuICAgICAgICB0ZXh0Pzogc3RyaW5nLFxuICAgICAgICBpbWFnZXM/OiBDYXJkSW1hZ2VbXSxcbiAgICAgICAgYnV0dG9ucz86IENhcmRBY3Rpb25bXSxcbiAgICAgICAgYXNwZWN0Pzogc3RyaW5nXG4gICAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1ZGlvQ2FyZCB7XG4gICAgY29udGVudFR5cGU6IFwiYXBwbGljYXRpb24vdm5kLm1pY3Jvc29mdC5jYXJkLmF1ZGlvXCIsXG4gICAgY29udGVudDoge1xuICAgICAgICB0aXRsZT86IHN0cmluZyxcbiAgICAgICAgc3VidGl0bGU/OiBzdHJpbmcsXG4gICAgICAgIHRleHQ/OiBzdHJpbmcsXG4gICAgICAgIG1lZGlhPzogeyB1cmw6IHN0cmluZywgcHJvZmlsZT86IHN0cmluZyB9W10sXG4gICAgICAgIGJ1dHRvbnM/OiBDYXJkQWN0aW9uW10sXG4gICAgICAgIGF1dG9sb29wPzogYm9vbGVhbixcbiAgICAgICAgYXV0b3N0YXJ0PzogYm9vbGVhblxuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBWaWRlb0NhcmQge1xuICAgIGNvbnRlbnRUeXBlOiBcImFwcGxpY2F0aW9uL3ZuZC5taWNyb3NvZnQuY2FyZC52aWRlb1wiLFxuICAgIGNvbnRlbnQ6IHtcbiAgICAgICAgdGl0bGU/OiBzdHJpbmcsXG4gICAgICAgIHN1YnRpdGxlPzogc3RyaW5nLFxuICAgICAgICB0ZXh0Pzogc3RyaW5nLFxuICAgICAgICBtZWRpYT86IHsgdXJsOiBzdHJpbmcsIHByb2ZpbGU/OiBzdHJpbmcgfVtdLFxuICAgICAgICBidXR0b25zPzogQ2FyZEFjdGlvbltdLFxuICAgICAgICBpbWFnZT86IHsgdXJsOiBzdHJpbmcsIGFsdD86IHN0cmluZyB9LFxuICAgICAgICBhdXRvbG9vcD86IGJvb2xlYW4sXG4gICAgICAgIGF1dG9zdGFydD86IGJvb2xlYW5cbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQWRhcHRpdmVDYXJkIHtcbiAgICBjb250ZW50VHlwZTogXCJhcHBsaWNhdGlvbi92bmQubWljcm9zb2Z0LmNhcmQuYWRhcHRpdmVcIixcbiAgICBjb250ZW50OiBhbnk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQW5pbWF0aW9uQ2FyZCB7XG4gICAgY29udGVudFR5cGU6IFwiYXBwbGljYXRpb24vdm5kLm1pY3Jvc29mdC5jYXJkLmFuaW1hdGlvblwiLFxuICAgIGNvbnRlbnQ6IHtcbiAgICAgICAgdGl0bGU/OiBzdHJpbmcsXG4gICAgICAgIHN1YnRpdGxlPzogc3RyaW5nLFxuICAgICAgICB0ZXh0Pzogc3RyaW5nLFxuICAgICAgICBtZWRpYT86IHsgdXJsOiBzdHJpbmcsIHByb2ZpbGU/OiBzdHJpbmcgfVtdLFxuICAgICAgICBidXR0b25zPzogQ2FyZEFjdGlvbltdLFxuICAgICAgICBpbWFnZT86IHsgdXJsOiBzdHJpbmcsIGFsdD86IHN0cmluZyB9LFxuICAgICAgICBhdXRvbG9vcD86IGJvb2xlYW4sXG4gICAgICAgIGF1dG9zdGFydD86IGJvb2xlYW5cbiAgICB9XG59XG5cbmV4cG9ydCB0eXBlIEtub3duTWVkaWEgPSBNZWRpYSB8IEhlcm9DYXJkIHwgVGh1bWJuYWlsIHwgU2lnbmluIHwgT0F1dGggfCBSZWNlaXB0IHwgQXVkaW9DYXJkIHwgVmlkZW9DYXJkIHwgQW5pbWF0aW9uQ2FyZCB8IEZsZXhDYXJkIHwgQWRhcHRpdmVDYXJkO1xuZXhwb3J0IHR5cGUgQXR0YWNobWVudCA9IEtub3duTWVkaWEgfCBVbmtub3duTWVkaWE7XG5cbmV4cG9ydCB0eXBlIFVzZXJSb2xlID0gXCJib3RcIiB8IFwiY2hhbm5lbFwiIHwgXCJ1c2VyXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVXNlciB7XG4gICAgaWQ6IHN0cmluZyxcbiAgICBuYW1lPzogc3RyaW5nLFxuICAgIGljb25Vcmw/OiBzdHJpbmcsXG4gICAgcm9sZT86IFVzZXJSb2xlXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGl2aXR5IHtcbiAgICB0eXBlOiBzdHJpbmcsXG4gICAgY2hhbm5lbERhdGE/OiBhbnksXG4gICAgY2hhbm5lbElkPzogc3RyaW5nLFxuICAgIGNvbnZlcnNhdGlvbj86IHsgaWQ6IHN0cmluZyB9LFxuICAgIGVUYWc/OiBzdHJpbmcsXG4gICAgZnJvbTogVXNlcixcbiAgICBpZD86IHN0cmluZyxcbiAgICB0aW1lc3RhbXA/OiBzdHJpbmdcbn1cblxuZXhwb3J0IHR5cGUgQXR0YWNobWVudExheW91dCA9IFwibGlzdFwiIHwgXCJjYXJvdXNlbFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1lc3NhZ2UgZXh0ZW5kcyBJQWN0aXZpdHkge1xuICAgIHR5cGU6IFwibWVzc2FnZVwiLFxuICAgIHRleHQ/OiBzdHJpbmcsXG4gICAgbG9jYWxlPzogc3RyaW5nLFxuICAgIHRleHRGb3JtYXQ/OiBcInBsYWluXCIgfCBcIm1hcmtkb3duXCIgfCBcInhtbFwiLFxuICAgIGF0dGFjaG1lbnRMYXlvdXQ/OiBBdHRhY2htZW50TGF5b3V0LFxuICAgIGF0dGFjaG1lbnRzPzogQXR0YWNobWVudFtdLFxuICAgIGVudGl0aWVzPzogYW55W10sXG4gICAgc3VnZ2VzdGVkQWN0aW9ucz86IHsgYWN0aW9uczogQ2FyZEFjdGlvbltdLCB0bz86IHN0cmluZ1tdIH0sXG4gICAgc3BlYWs/OiBzdHJpbmcsXG4gICAgaW5wdXRIaW50Pzogc3RyaW5nLFxuICAgIHZhbHVlPzogb2JqZWN0XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHlwaW5nIGV4dGVuZHMgSUFjdGl2aXR5IHtcbiAgICB0eXBlOiBcInR5cGluZ1wiXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXZlbnRBY3Rpdml0eSBleHRlbmRzIElBY3Rpdml0eSB7XG4gICAgdHlwZTogXCJldmVudFwiLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICB2YWx1ZTogYW55XG59XG5cbmV4cG9ydCB0eXBlIEFjdGl2aXR5ID0gTWVzc2FnZSB8IFR5cGluZyB8IEV2ZW50QWN0aXZpdHk7XG5cbmludGVyZmFjZSBBY3Rpdml0eUdyb3VwIHtcbiAgICBhY3Rpdml0aWVzOiBBY3Rpdml0eVtdLFxuICAgIHdhdGVybWFyazogc3RyaW5nXG59XG5cbi8vIFRoZXNlIHR5cGVzIGFyZSBzcGVjaWZpYyB0byB0aGlzIGNsaWVudCBsaWJyYXJ5LCBub3QgdG8gRGlyZWN0IExpbmUgMy4wXG5cbmV4cG9ydCBlbnVtIENvbm5lY3Rpb25TdGF0dXMge1xuICAgIFVuaW5pdGlhbGl6ZWQsICAgICAgICAgICAgICAvLyB0aGUgc3RhdHVzIHdoZW4gdGhlIERpcmVjdExpbmUgb2JqZWN0IGlzIGZpcnN0IGNyZWF0ZWQvY29uc3RydWN0ZWRcbiAgICBDb25uZWN0aW5nLCAgICAgICAgICAgICAgICAgLy8gY3VycmVudGx5IHRyeWluZyB0byBjb25uZWN0IHRvIHRoZSBjb252ZXJzYXRpb25cbiAgICBPbmxpbmUsICAgICAgICAgICAgICAgICAgICAgLy8gc3VjY2Vzc2Z1bGx5IGNvbm5lY3RlZCB0byB0aGUgY29udmVyc3RhaW9uLiBDb25uZWN0aW9uIGlzIGhlYWx0aHkgc28gZmFyIGFzIHdlIGtub3cuXG4gICAgRXhwaXJlZFRva2VuLCAgICAgICAgICAgICAgIC8vIGxhc3Qgb3BlcmF0aW9uIGVycm9yZWQgb3V0IHdpdGggYW4gZXhwaXJlZCB0b2tlbi4gUG9zc2libHkgd2FpdGluZyBmb3Igc29tZW9uZSB0byBzdXBwbHkgYSBuZXcgb25lLlxuICAgIEZhaWxlZFRvQ29ubmVjdCwgICAgICAgICAgICAvLyB0aGUgaW5pdGlhbCBhdHRlbXB0IHRvIGNvbm5lY3QgdG8gdGhlIGNvbnZlcnNhdGlvbiBmYWlsZWQuIE5vIHJlY292ZXJ5IHBvc3NpYmxlLlxuICAgIEVuZGVkICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgYm90IGVuZGVkIHRoZSBjb252ZXJzYXRpb25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaXJlY3RMaW5lT3B0aW9ucyB7XG4gICAgc2VjcmV0Pzogc3RyaW5nLFxuICAgIHRva2VuPzogc3RyaW5nLFxuICAgIGNvbnZlcnNhdGlvbklkPzogc3RyaW5nLFxuICAgIHdhdGVybWFyaz86IHN0cmluZyxcbiAgICBkb21haW4/OiBzdHJpbmcsXG4gICAgd2ViU29ja2V0PzogYm9vbGVhbixcbiAgICBwb2xsaW5nSW50ZXJ2YWw/OiBudW1iZXIsXG4gICAgc3RyZWFtVXJsPzogc3RyaW5nLFxuICAgIC8vIEF0dGFjaGVkIHRvIGFsbCByZXF1ZXN0cyB0byBpZGVudGlmeSByZXF1ZXN0aW5nIGFnZW50LlxuICAgIGJvdEFnZW50Pzogc3RyaW5nXG59XG5cbmNvbnN0IGxpZmV0aW1lUmVmcmVzaFRva2VuID0gMzAgKiA2MCAqIDEwMDA7XG5jb25zdCBpbnRlcnZhbFJlZnJlc2hUb2tlbiA9IGxpZmV0aW1lUmVmcmVzaFRva2VuIC8gMjtcbmNvbnN0IHRpbWVvdXQgPSAyMCAqIDEwMDA7XG5jb25zdCByZXRyaWVzID0gKGxpZmV0aW1lUmVmcmVzaFRva2VuIC0gaW50ZXJ2YWxSZWZyZXNoVG9rZW4pIC8gdGltZW91dDtcblxuY29uc3QgUE9MTElOR19JTlRFUlZBTF9MT1dFUl9CT1VORDogbnVtYmVyID0gMjAwOyAvL21zXG5cbmNvbnN0IGVycm9yRXhwaXJlZFRva2VuID0gbmV3IEVycm9yKFwiZXhwaXJlZCB0b2tlblwiKTtcbmNvbnN0IGVycm9yQ29udmVyc2F0aW9uRW5kZWQgPSBuZXcgRXJyb3IoXCJjb252ZXJzYXRpb24gZW5kZWRcIik7XG5jb25zdCBlcnJvckZhaWxlZFRvQ29ubmVjdCA9IG5ldyBFcnJvcihcImZhaWxlZCB0byBjb25uZWN0XCIpO1xuXG5jb25zdCBrb25zb2xlID0ge1xuICAgIGxvZzogKG1lc3NhZ2U/OiBhbnksIC4uLiBvcHRpb25hbFBhcmFtczogYW55W10pID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmICh3aW5kb3cgYXMgYW55KVtcImJvdGNoYXREZWJ1Z1wiXSAmJiBtZXNzYWdlKVxuICAgICAgICAgICAgY29uc29sZS5sb2cobWVzc2FnZSwgLi4uIG9wdGlvbmFsUGFyYW1zKTtcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJvdENvbm5lY3Rpb24ge1xuICAgIGNvbm5lY3Rpb25TdGF0dXMkOiBCZWhhdmlvclN1YmplY3Q8Q29ubmVjdGlvblN0YXR1cz4sXG4gICAgYWN0aXZpdHkkOiBPYnNlcnZhYmxlPEFjdGl2aXR5PixcbiAgICBlbmQoKTogdm9pZCxcbiAgICByZWZlcmVuY2VHcmFtbWFySWQ/OiBzdHJpbmcsXG4gICAgcG9zdEFjdGl2aXR5KGFjdGl2aXR5OiBBY3Rpdml0eSk6IE9ic2VydmFibGU8c3RyaW5nPixcbiAgICBnZXRTZXNzaW9uSWQ/IDogKCkgPT4gT2JzZXJ2YWJsZTxzdHJpbmc+XG59XG5cbmV4cG9ydCBjbGFzcyBEaXJlY3RMaW5lIGltcGxlbWVudHMgSUJvdENvbm5lY3Rpb24ge1xuICAgIHB1YmxpYyBjb25uZWN0aW9uU3RhdHVzJCA9IG5ldyBCZWhhdmlvclN1YmplY3QoQ29ubmVjdGlvblN0YXR1cy5VbmluaXRpYWxpemVkKTtcbiAgICBwdWJsaWMgYWN0aXZpdHkkOiBPYnNlcnZhYmxlPEFjdGl2aXR5PjtcblxuICAgIHByaXZhdGUgZG9tYWluID0gXCJodHRwczovL2RpcmVjdGxpbmUuYm90ZnJhbWV3b3JrLmNvbS92My9kaXJlY3RsaW5lXCI7XG4gICAgcHJpdmF0ZSB3ZWJTb2NrZXQ6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIGNvbnZlcnNhdGlvbklkOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBleHBpcmVkVG9rZW5FeGhhdXN0aW9uOiBGdW5jdGlvbjtcbiAgICBwcml2YXRlIHNlY3JldDogc3RyaW5nO1xuICAgIHByaXZhdGUgdG9rZW46IHN0cmluZztcbiAgICBwcml2YXRlIHdhdGVybWFyayA9ICcnO1xuICAgIHByaXZhdGUgc3RyZWFtVXJsOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBfYm90QWdlbnQgPSAnJztcbiAgICBwcml2YXRlIF91c2VyQWdlbnQ6IHN0cmluZztcbiAgICBwdWJsaWMgcmVmZXJlbmNlR3JhbW1hcklkOiBzdHJpbmc7XG5cbiAgICBwcml2YXRlIHBvbGxpbmdJbnRlcnZhbDogbnVtYmVyID0gMTAwMDsgLy9tc1xuXG4gICAgcHJpdmF0ZSB0b2tlblJlZnJlc2hTdWJzY3JpcHRpb246IFN1YnNjcmlwdGlvbjtcblxuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnM6IERpcmVjdExpbmVPcHRpb25zKSB7XG4gICAgICAgIHRoaXMuc2VjcmV0ID0gb3B0aW9ucy5zZWNyZXQ7XG4gICAgICAgIHRoaXMudG9rZW4gPSBvcHRpb25zLnNlY3JldCB8fCBvcHRpb25zLnRva2VuO1xuICAgICAgICB0aGlzLndlYlNvY2tldCA9IChvcHRpb25zLndlYlNvY2tldCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IG9wdGlvbnMud2ViU29ja2V0KSAmJiB0eXBlb2YgV2ViU29ja2V0ICE9PSAndW5kZWZpbmVkJyAmJiBXZWJTb2NrZXQgIT09IHVuZGVmaW5lZDtcblxuICAgICAgICBpZiAob3B0aW9ucy5kb21haW4pIHtcbiAgICAgICAgICAgIHRoaXMuZG9tYWluID0gb3B0aW9ucy5kb21haW47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9ucy5jb252ZXJzYXRpb25JZCkge1xuICAgICAgICAgICAgdGhpcy5jb252ZXJzYXRpb25JZCA9IG9wdGlvbnMuY29udmVyc2F0aW9uSWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9ucy53YXRlcm1hcmspIHtcbiAgICAgICAgICAgIHRoaXMud2F0ZXJtYXJrID0gIG9wdGlvbnMud2F0ZXJtYXJrO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuc3RyZWFtVXJsKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy50b2tlbiAmJiBvcHRpb25zLmNvbnZlcnNhdGlvbklkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdHJlYW1VcmwgPSBvcHRpb25zLnN0cmVhbVVybDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdEaXJlY3RMaW5lSlM6IHN0cmVhbVVybCB3YXMgaWdub3JlZDogeW91IG5lZWQgdG8gcHJvdmlkZSBhIHRva2VuIGFuZCBhIGNvbnZlcnNhdGlvbmlkJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9ib3RBZ2VudCA9IHRoaXMuZ2V0Qm90QWdlbnQob3B0aW9ucy5ib3RBZ2VudCk7XG5cbiAgICAgICAgY29uc3QgcGFyc2VkUG9sbGluZ0ludGVydmFsID0gfn5vcHRpb25zLnBvbGxpbmdJbnRlcnZhbDtcblxuICAgICAgICBpZiAocGFyc2VkUG9sbGluZ0ludGVydmFsIDwgUE9MTElOR19JTlRFUlZBTF9MT1dFUl9CT1VORCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zLnBvbGxpbmdJbnRlcnZhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYERpcmVjdExpbmVKUzogcHJvdmlkZWQgcG9sbGluZ0ludGVydmFsICgkeyBvcHRpb25zLnBvbGxpbmdJbnRlcnZhbCB9KSBpcyB1bmRlciBsb3dlciBib3VuZCAoMjAwbXMpLCB1c2luZyBkZWZhdWx0IG9mIDEwMDBtc2ApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wb2xsaW5nSW50ZXJ2YWwgPSBwYXJzZWRQb2xsaW5nSW50ZXJ2YWw7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmV4cGlyZWRUb2tlbkV4aGF1c3Rpb24gPSB0aGlzLnNldENvbm5lY3Rpb25TdGF0dXNGYWxsYmFjayhcbiAgICAgICAgICAgIENvbm5lY3Rpb25TdGF0dXMuRXhwaXJlZFRva2VuLFxuICAgICAgICAgICAgQ29ubmVjdGlvblN0YXR1cy5GYWlsZWRUb0Nvbm5lY3QsXG4gICAgICAgICAgICA1XG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy5hY3Rpdml0eSQgPSAodGhpcy53ZWJTb2NrZXRcbiAgICAgICAgICAgID8gdGhpcy53ZWJTb2NrZXRBY3Rpdml0eSQoKVxuICAgICAgICAgICAgOiB0aGlzLnBvbGxpbmdHZXRBY3Rpdml0eSQoKVxuICAgICAgICApLnNoYXJlKCk7XG4gICAgfVxuXG4gICAgLy8gRXZlcnkgdGltZSB3ZSdyZSBhYm91dCB0byBtYWtlIGEgRGlyZWN0IExpbmUgUkVTVCBjYWxsLCB3ZSBjYWxsIHRoaXMgZmlyc3QgdG8gc2VlIGNoZWNrIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gc3RhdHVzLlxuICAgIC8vIEVpdGhlciB0aHJvd3MgYW4gZXJyb3IgKGluZGljYXRpbmcgYW4gZXJyb3Igc3RhdGUpIG9yIGVtaXRzIGEgbnVsbCwgaW5kaWNhdGluZyBhIChwcmVzdW1hYmx5KSBoZWFsdGh5IGNvbm5lY3Rpb25cbiAgICBwcml2YXRlIGNoZWNrQ29ubmVjdGlvbihvbmNlID0gZmFsc2UpIHtcbiAgICAgICAgbGV0IG9icyA9ICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMkXG4gICAgICAgIC5mbGF0TWFwKGNvbm5lY3Rpb25TdGF0dXMgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbm5lY3Rpb25TdGF0dXMgPT09IENvbm5lY3Rpb25TdGF0dXMuVW5pbml0aWFsaXplZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyQubmV4dChDb25uZWN0aW9uU3RhdHVzLkNvbm5lY3RpbmcpO1xuXG4gICAgICAgICAgICAgICAgLy9pZiB0b2tlbiBhbmQgc3RyZWFtVXJsIGFyZSBkZWZpbmVkIGl0IG1lYW5zIHJlY29ubmVjdCBoYXMgYWxyZWFkeSBiZWVuIGRvbmUuIFNraXBwaW5nIGl0LlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRva2VuICYmIHRoaXMuc3RyZWFtVXJsKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyQubmV4dChDb25uZWN0aW9uU3RhdHVzLk9ubGluZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKGNvbm5lY3Rpb25TdGF0dXMpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YXJ0Q29udmVyc2F0aW9uKCkuZG8oY29udmVyc2F0aW9uID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29udmVyc2F0aW9uSWQgPSBjb252ZXJzYXRpb24uY29udmVyc2F0aW9uSWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VuID0gdGhpcy5zZWNyZXQgfHwgY29udmVyc2F0aW9uLnRva2VuO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdHJlYW1VcmwgPSBjb252ZXJzYXRpb24uc3RyZWFtVXJsO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZWZlcmVuY2VHcmFtbWFySWQgPSBjb252ZXJzYXRpb24ucmVmZXJlbmNlR3JhbW1hcklkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNlY3JldClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlZnJlc2hUb2tlbkxvb3AoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzJC5uZXh0KENvbm5lY3Rpb25TdGF0dXMuT25saW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfSwgZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzJC5uZXh0KENvbm5lY3Rpb25TdGF0dXMuRmFpbGVkVG9Db25uZWN0KTtcbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChfID0+IGNvbm5lY3Rpb25TdGF0dXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKGNvbm5lY3Rpb25TdGF0dXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuZmlsdGVyKGNvbm5lY3Rpb25TdGF0dXMgPT4gY29ubmVjdGlvblN0YXR1cyAhPSBDb25uZWN0aW9uU3RhdHVzLlVuaW5pdGlhbGl6ZWQgJiYgY29ubmVjdGlvblN0YXR1cyAhPSBDb25uZWN0aW9uU3RhdHVzLkNvbm5lY3RpbmcpXG4gICAgICAgIC5mbGF0TWFwKGNvbm5lY3Rpb25TdGF0dXMgPT4ge1xuICAgICAgICAgICAgc3dpdGNoIChjb25uZWN0aW9uU3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBDb25uZWN0aW9uU3RhdHVzLkVuZGVkOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS50aHJvdyhlcnJvckNvbnZlcnNhdGlvbkVuZGVkKTtcblxuICAgICAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvblN0YXR1cy5GYWlsZWRUb0Nvbm5lY3Q6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLnRocm93KGVycm9yRmFpbGVkVG9Db25uZWN0KTtcblxuICAgICAgICAgICAgICAgIGNhc2UgQ29ubmVjdGlvblN0YXR1cy5FeHBpcmVkVG9rZW46XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKGNvbm5lY3Rpb25TdGF0dXMpO1xuXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2YoY29ubmVjdGlvblN0YXR1cyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgICAgcmV0dXJuIG9uY2UgPyBvYnMudGFrZSgxKSA6IG9icztcbiAgICB9XG5cbiAgICBzZXRDb25uZWN0aW9uU3RhdHVzRmFsbGJhY2soXG4gICAgICAgIGNvbm5lY3Rpb25TdGF0dXNGcm9tOiBDb25uZWN0aW9uU3RhdHVzLFxuICAgICAgICBjb25uZWN0aW9uU3RhdHVzVG86IENvbm5lY3Rpb25TdGF0dXMsXG4gICAgICAgIG1heEF0dGVtcHRzID0gNVxuICAgICkge1xuICAgICAgICBtYXhBdHRlbXB0cy0tO1xuICAgICAgICBsZXQgYXR0ZW1wdHMgPSAwO1xuICAgICAgICBsZXQgY3VyclN0YXR1cyA9IG51bGw7XG4gICAgICAgIHJldHVybiAoc3RhdHVzOiBDb25uZWN0aW9uU3RhdHVzKTogQ29ubmVjdGlvblN0YXR1cyA9PiB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSBjb25uZWN0aW9uU3RhdHVzRnJvbSAmJiBjdXJyU3RhdHVzID09PSBzdGF0dXMgJiYgYXR0ZW1wdHMgPj0gbWF4QXR0ZW1wdHMpIHtcbiAgICAgICAgICAgICAgICBhdHRlbXB0cyA9IDBcbiAgICAgICAgICAgICAgICByZXR1cm4gY29ubmVjdGlvblN0YXR1c1RvO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXR0ZW1wdHMrKztcbiAgICAgICAgICAgIGN1cnJTdGF0dXMgPSBzdGF0dXM7XG4gICAgICAgICAgICByZXR1cm4gc3RhdHVzO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhwaXJlZFRva2VuKCkge1xuICAgICAgICBjb25zdCBjb25uZWN0aW9uU3RhdHVzID0gdGhpcy5jb25uZWN0aW9uU3RhdHVzJC5nZXRWYWx1ZSgpO1xuICAgICAgICBpZiAoY29ubmVjdGlvblN0YXR1cyAhPSBDb25uZWN0aW9uU3RhdHVzLkVuZGVkICYmIGNvbm5lY3Rpb25TdGF0dXMgIT0gQ29ubmVjdGlvblN0YXR1cy5GYWlsZWRUb0Nvbm5lY3QpXG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMkLm5leHQoQ29ubmVjdGlvblN0YXR1cy5FeHBpcmVkVG9rZW4pO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZENvbm5lY3Rpb25TdGF0dXMgPSB0aGlzLmV4cGlyZWRUb2tlbkV4aGF1c3Rpb24odGhpcy5jb25uZWN0aW9uU3RhdHVzJC5nZXRWYWx1ZSgpKTtcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzJC5uZXh0KHByb3RlY3RlZENvbm5lY3Rpb25TdGF0dXMpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RhcnRDb252ZXJzYXRpb24oKSB7XG4gICAgICAgIC8vaWYgY29udmVyc2F0aW9uaWQgaXMgc2V0IGhlcmUsIGl0IG1lYW5zIHdlIG5lZWQgdG8gY2FsbCB0aGUgcmVjb25uZWN0IGFwaSwgZWxzZSBpdCBpcyBhIG5ldyBjb252ZXJzYXRpb25cbiAgICAgICAgY29uc3QgdXJsID0gdGhpcy5jb252ZXJzYXRpb25JZFxuICAgICAgICAgICAgPyBgJHt0aGlzLmRvbWFpbn0vY29udmVyc2F0aW9ucy8ke3RoaXMuY29udmVyc2F0aW9uSWR9P3dhdGVybWFyaz0ke3RoaXMud2F0ZXJtYXJrfWBcbiAgICAgICAgICAgIDogYCR7dGhpcy5kb21haW59L2NvbnZlcnNhdGlvbnNgO1xuICAgICAgICBjb25zdCBtZXRob2QgPSB0aGlzLmNvbnZlcnNhdGlvbklkID8gXCJHRVRcIiA6IFwiUE9TVFwiO1xuXG4gICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmFqYXgoe1xuICAgICAgICAgICAgbWV0aG9kLFxuICAgICAgICAgICAgdXJsLFxuICAgICAgICAgICAgdGltZW91dCxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICAgICAgICAuLi50aGlzLmNvbW1vbkhlYWRlcnMoKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuLy8gICAgICAuZG8oYWpheFJlc3BvbnNlID0+IGtvbnNvbGUubG9nKFwiY29udmVyc2F0aW9uIGFqYXhSZXNwb25zZVwiLCBhamF4UmVzcG9uc2UucmVzcG9uc2UpKVxuICAgICAgICAubWFwKGFqYXhSZXNwb25zZSA9PiBhamF4UmVzcG9uc2UucmVzcG9uc2UgYXMgQ29udmVyc2F0aW9uKVxuICAgICAgICAucmV0cnlXaGVuKGVycm9yJCA9PlxuICAgICAgICAgICAgLy8gZm9yIG5vdyB3ZSBkZWVtIDR4eCBhbmQgNXh4IGVycm9ycyBhcyB1bnJlY292ZXJhYmxlXG4gICAgICAgICAgICAvLyBmb3IgZXZlcnl0aGluZyBlbHNlICh0aW1lb3V0cyksIHJldHJ5IGZvciBhIHdoaWxlXG4gICAgICAgICAgICBlcnJvciQubWVyZ2VNYXAoZXJyb3IgPT4gZXJyb3Iuc3RhdHVzID49IDQwMCAmJiBlcnJvci5zdGF0dXMgPCA2MDBcbiAgICAgICAgICAgICAgICA/IE9ic2VydmFibGUudGhyb3coZXJyb3IpXG4gICAgICAgICAgICAgICAgOiBPYnNlcnZhYmxlLm9mKGVycm9yKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmRlbGF5KHRpbWVvdXQpXG4gICAgICAgICAgICAudGFrZShyZXRyaWVzKVxuICAgICAgICApXG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZWZyZXNoVG9rZW5Mb29wKCkge1xuICAgICAgICB0aGlzLnRva2VuUmVmcmVzaFN1YnNjcmlwdGlvbiA9IE9ic2VydmFibGUuaW50ZXJ2YWwoaW50ZXJ2YWxSZWZyZXNoVG9rZW4pXG4gICAgICAgIC5mbGF0TWFwKF8gPT4gdGhpcy5yZWZyZXNoVG9rZW4oKSlcbiAgICAgICAgLnN1YnNjcmliZSh0b2tlbiA9PiB7XG4gICAgICAgICAgICBrb25zb2xlLmxvZyhcInJlZnJlc2hpbmcgdG9rZW5cIiwgdG9rZW4sIFwiYXRcIiwgbmV3IERhdGUoKSk7XG4gICAgICAgICAgICB0aGlzLnRva2VuID0gdG9rZW47XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVmcmVzaFRva2VuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGVja0Nvbm5lY3Rpb24odHJ1ZSlcbiAgICAgICAgLmZsYXRNYXAoXyA9PlxuICAgICAgICAgICAgT2JzZXJ2YWJsZS5hamF4KHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICAgICAgICAgIHVybDogYCR7dGhpcy5kb21haW59L3Rva2Vucy9yZWZyZXNoYCxcbiAgICAgICAgICAgICAgICB0aW1lb3V0LFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgLi4udGhpcy5jb21tb25IZWFkZXJzKClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLm1hcChhamF4UmVzcG9uc2UgPT4gYWpheFJlc3BvbnNlLnJlc3BvbnNlLnRva2VuIGFzIHN0cmluZylcbiAgICAgICAgICAgIC5yZXRyeVdoZW4oZXJyb3IkID0+IGVycm9yJFxuICAgICAgICAgICAgICAgIC5tZXJnZU1hcChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvci5zdGF0dXMgPT09IDQwMykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIHRva2VuIGlzIGV4cGlyZWQgdGhlcmUncyBubyByZWFzb24gdG8ga2VlcCB0cnlpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXhwaXJlZFRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS50aHJvdyhlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXJyb3Iuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSBib3QgaXMgZ29uZSwgd2Ugc2hvdWxkIHN0b3AgcmV0cnlpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLnRocm93KGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKGVycm9yKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5kZWxheSh0aW1lb3V0KVxuICAgICAgICAgICAgICAgIC50YWtlKHJldHJpZXMpXG4gICAgICAgICAgICApXG4gICAgICAgIClcbiAgICB9XG5cbiAgICBwdWJsaWMgcmVjb25uZWN0KGNvbnZlcnNhdGlvbjogQ29udmVyc2F0aW9uKSB7XG4gICAgICAgIHRoaXMudG9rZW4gPSBjb252ZXJzYXRpb24udG9rZW47XG4gICAgICAgIHRoaXMuc3RyZWFtVXJsID0gY29udmVyc2F0aW9uLnN0cmVhbVVybDtcbiAgICAgICAgaWYgKHRoaXMuY29ubmVjdGlvblN0YXR1cyQuZ2V0VmFsdWUoKSA9PT0gQ29ubmVjdGlvblN0YXR1cy5FeHBpcmVkVG9rZW4pXG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMkLm5leHQoQ29ubmVjdGlvblN0YXR1cy5PbmxpbmUpO1xuICAgIH1cblxuICAgIGVuZCgpIHtcbiAgICAgICAgaWYgKHRoaXMudG9rZW5SZWZyZXNoU3Vic2NyaXB0aW9uKVxuICAgICAgICAgICAgdGhpcy50b2tlblJlZnJlc2hTdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvblN0YXR1cyQubmV4dChDb25uZWN0aW9uU3RhdHVzLkVuZGVkKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgaWYgKGUgPT09IGVycm9yQ29udmVyc2F0aW9uRW5kZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhyb3coZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRTZXNzaW9uSWQoKTogT2JzZXJ2YWJsZTxzdHJpbmc+IHtcbiAgICAgICAgLy8gSWYgd2UncmUgbm90IGNvbm5lY3RlZCB0byB0aGUgYm90LCBnZXQgY29ubmVjdGVkXG4gICAgICAgIC8vIFdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgd2UgYXJlIG5vdCBjb25uZWN0ZWRcbiAgICAgICAga29uc29sZS5sb2coXCJnZXRTZXNzaW9uSWRcIik7XG4gICAgICAgIHJldHVybiB0aGlzLmNoZWNrQ29ubmVjdGlvbih0cnVlKVxuICAgICAgICAgICAgLmZsYXRNYXAoXyA9PlxuICAgICAgICAgICAgICAgIE9ic2VydmFibGUuYWpheCh7XG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgICAgICAgICAgICAgdXJsOiBgJHt0aGlzLmRvbWFpbn0vc2Vzc2lvbi9nZXRzZXNzaW9uaWRgLFxuICAgICAgICAgICAgICAgICAgICB3aXRoQ3JlZGVudGlhbHM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXQsXG4gICAgICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgLi4udGhpcy5jb21tb25IZWFkZXJzKClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLm1hcChhamF4UmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWpheFJlc3BvbnNlICYmIGFqYXhSZXNwb25zZS5yZXNwb25zZSAmJiBhamF4UmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrb25zb2xlLmxvZyhcImdldFNlc3Npb25JZCByZXNwb25zZTogXCIgKyBhamF4UmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvbklkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBhamF4UmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvbklkIGFzIHN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgICAgICBrb25zb2xlLmxvZyhcImdldFNlc3Npb25JZCBlcnJvcjogXCIgKyBlcnJvci5zdGF0dXMpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZignJyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB0aGlzLmNhdGNoRXhwaXJlZFRva2VuKGVycm9yKSk7XG4gICAgfVxuXG4gICAgcG9zdEFjdGl2aXR5KGFjdGl2aXR5OiBBY3Rpdml0eSkge1xuICAgICAgICAvLyBVc2UgcG9zdE1lc3NhZ2VXaXRoQXR0YWNobWVudHMgZm9yIG1lc3NhZ2VzIHdpdGggYXR0YWNobWVudHMgdGhhdCBhcmUgbG9jYWwgZmlsZXMgKGUuZy4gYW4gaW1hZ2UgdG8gdXBsb2FkKVxuICAgICAgICAvLyBUZWNobmljYWxseSB3ZSBjb3VsZCB1c2UgaXQgZm9yICphbGwqIGFjdGl2aXRpZXMsIGJ1dCBwb3N0QWN0aXZpdHkgaXMgbXVjaCBsaWdodGVyIHdlaWdodFxuICAgICAgICAvLyBTbywgc2luY2UgV2ViQ2hhdCBpcyBwYXJ0aWFsbHkgYSByZWZlcmVuY2UgaW1wbGVtZW50YXRpb24gb2YgRGlyZWN0IExpbmUsIHdlIGltcGxlbWVudCBib3RoLlxuICAgICAgICBpZiAoYWN0aXZpdHkudHlwZSA9PT0gXCJtZXNzYWdlXCIgJiYgYWN0aXZpdHkuYXR0YWNobWVudHMgJiYgYWN0aXZpdHkuYXR0YWNobWVudHMubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBvc3RNZXNzYWdlV2l0aEF0dGFjaG1lbnRzKGFjdGl2aXR5KTtcblxuICAgICAgICAvLyBJZiB3ZSdyZSBub3QgY29ubmVjdGVkIHRvIHRoZSBib3QsIGdldCBjb25uZWN0ZWRcbiAgICAgICAgLy8gV2lsbCB0aHJvdyBhbiBlcnJvciBpZiB3ZSBhcmUgbm90IGNvbm5lY3RlZFxuICAgICAgICBrb25zb2xlLmxvZyhcInBvc3RBY3Rpdml0eVwiLCBhY3Rpdml0eSk7XG4gICAgICAgIHJldHVybiB0aGlzLmNoZWNrQ29ubmVjdGlvbih0cnVlKVxuICAgICAgICAuZmxhdE1hcChfID0+XG4gICAgICAgICAgICBPYnNlcnZhYmxlLmFqYXgoe1xuICAgICAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgICAgICAgICAgdXJsOiBgJHt0aGlzLmRvbWFpbn0vY29udmVyc2F0aW9ucy8ke3RoaXMuY29udmVyc2F0aW9uSWR9L2FjdGl2aXRpZXNgLFxuICAgICAgICAgICAgICAgIGJvZHk6IGFjdGl2aXR5LFxuICAgICAgICAgICAgICAgIHRpbWVvdXQsXG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgICAgICAgICAgICAgLi4udGhpcy5jb21tb25IZWFkZXJzKClcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5tYXAoYWpheFJlc3BvbnNlID0+IGFqYXhSZXNwb25zZS5yZXNwb25zZS5pZCBhcyBzdHJpbmcpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4gdGhpcy5jYXRjaFBvc3RFcnJvcihlcnJvcikpXG4gICAgICAgIClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHRoaXMuY2F0Y2hFeHBpcmVkVG9rZW4oZXJyb3IpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHBvc3RNZXNzYWdlV2l0aEF0dGFjaG1lbnRzKG1lc3NhZ2U6IE1lc3NhZ2UpIHtcbiAgICAgICAgY29uc3QgeyBhdHRhY2htZW50cyB9ID0gbWVzc2FnZTtcbiAgICAgICAgLy8gV2UgY2xlYW4gdGhlIGF0dGFjaG1lbnRzIGJ1dCBtYWtpbmcgc3VyZSBldmVyeSBhdHRhY2htZW50IGhhcyB1bmlxdWUgbmFtZS5cbiAgICAgICAgLy8gSWYgdGhlIGZpbGUgZG8gbm90IGhhdmUgYSBuYW1lLCBDaHJvbWUgd2lsbCBhc3NpZ24gXCJibG9iXCIgd2hlbiBpdCBpcyBhcHBlbmRlZCB0byBGb3JtRGF0YS5cbiAgICAgICAgY29uc3QgYXR0YWNobWVudE5hbWVzOiBzdHJpbmdbXSA9IGRlZHVwZUZpbGVuYW1lcyhhdHRhY2htZW50cy5tYXAoKG1lZGlhOiBNZWRpYSkgPT4gbWVkaWEubmFtZSB8fCAnYmxvYicpKTtcbiAgICAgICAgY29uc3QgY2xlYW5zZWRBdHRhY2htZW50cyA9IGF0dGFjaG1lbnRzLm1hcCgoYXR0YWNobWVudDogTWVkaWEsIGluZGV4OiBudW1iZXIpID0+ICh7XG4gICAgICAgICAgICAuLi5hdHRhY2htZW50LFxuICAgICAgICAgICAgbmFtZTogYXR0YWNobWVudE5hbWVzW2luZGV4XVxuICAgICAgICB9KSk7XG4gICAgICAgIGxldCBmb3JtRGF0YTogRm9ybURhdGE7XG5cbiAgICAgICAgLy8gSWYgd2UncmUgbm90IGNvbm5lY3RlZCB0byB0aGUgYm90LCBnZXQgY29ubmVjdGVkXG4gICAgICAgIC8vIFdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgd2UgYXJlIG5vdCBjb25uZWN0ZWRcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hlY2tDb25uZWN0aW9uKHRydWUpXG4gICAgICAgIC5mbGF0TWFwKF8gPT4ge1xuICAgICAgICAgICAgLy8gVG8gc2VuZCB0aGlzIG1lc3NhZ2UgdG8gRGlyZWN0TGluZSB3ZSBuZWVkIHRvIGRlY29uc3RydWN0IGl0IGludG8gYSBcInRlbXBsYXRlXCIgYWN0aXZpdHlcbiAgICAgICAgICAgIC8vIGFuZCBvbmUgYmxvYiBmb3IgZWFjaCBhdHRhY2htZW50LlxuICAgICAgICAgICAgZm9ybURhdGEgPSBuZXcgRm9ybURhdGEoKTtcbiAgICAgICAgICAgIGZvcm1EYXRhLmFwcGVuZCgnYWN0aXZpdHknLCBuZXcgQmxvYihbSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIC4uLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZpbmcgY29udGVudFVybCBmcm9tIGF0dGFjaG1lbnQsIHdlIHdpbGwgc2VuZCBpdCB2aWEgbXVsdGlwYXJ0XG4gICAgICAgICAgICAgICAgYXR0YWNobWVudHM6IGNsZWFuc2VkQXR0YWNobWVudHMubWFwKCh7IGNvbnRlbnRVcmw6IHN0cmluZywgLi4ub3RoZXJzIH0pID0+ICh7IC4uLm90aGVycyB9KSlcbiAgICAgICAgICAgIH0pXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vdm5kLm1pY3Jvc29mdC5hY3Rpdml0eScgfSkpO1xuXG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5mcm9tKGNsZWFuc2VkQXR0YWNobWVudHMpXG4gICAgICAgICAgICAuZmxhdE1hcCgobWVkaWE6IE1lZGlhKSA9PlxuICAgICAgICAgICAgICAgIE9ic2VydmFibGUuYWpheCh7XG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgICAgICAgICAgICAgdXJsOiBtZWRpYS5jb250ZW50VXJsLFxuICAgICAgICAgICAgICAgICAgICByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcidcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC5kbyhhamF4UmVzcG9uc2UgPT5cbiAgICAgICAgICAgICAgICAgICAgZm9ybURhdGEuYXBwZW5kKCdmaWxlJywgbmV3IEJsb2IoW2FqYXhSZXNwb25zZS5yZXNwb25zZV0sIHsgdHlwZTogbWVkaWEuY29udGVudFR5cGUgfSksIG1lZGlhLm5hbWUpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmNvdW50KClcbiAgICAgICAgfSlcbiAgICAgICAgLmZsYXRNYXAoXyA9PlxuICAgICAgICAgICAgT2JzZXJ2YWJsZS5hamF4KHtcbiAgICAgICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICAgICAgICAgIHVybDogYCR7dGhpcy5kb21haW59L2NvbnZlcnNhdGlvbnMvJHt0aGlzLmNvbnZlcnNhdGlvbklkfS91cGxvYWQ/dXNlcklkPSR7bWVzc2FnZS5mcm9tLmlkfWAsXG4gICAgICAgICAgICAgICAgYm9keTogZm9ybURhdGEsXG4gICAgICAgICAgICAgICAgdGltZW91dCxcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgICAgIC4uLnRoaXMuY29tbW9uSGVhZGVycygpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5tYXAoYWpheFJlc3BvbnNlID0+IGFqYXhSZXNwb25zZS5yZXNwb25zZS5pZCBhcyBzdHJpbmcpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4gdGhpcy5jYXRjaFBvc3RFcnJvcihlcnJvcikpXG4gICAgICAgIClcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHRoaXMuY2F0Y2hQb3N0RXJyb3IoZXJyb3IpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhdGNoUG9zdEVycm9yKGVycm9yOiBhbnkpIHtcbiAgICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNDAzKVxuICAgICAgICAgICAgLy8gdG9rZW4gaGFzIGV4cGlyZWQgKHdpbGwgZmFsbCB0aHJvdWdoIHRvIHJldHVybiBcInJldHJ5XCIpXG4gICAgICAgICAgICB0aGlzLmV4cGlyZWRUb2tlbigpO1xuICAgICAgICBlbHNlIGlmIChlcnJvci5zdGF0dXMgPj0gNDAwICYmIGVycm9yLnN0YXR1cyA8IDUwMClcbiAgICAgICAgICAgIC8vIG1vcmUgdW5yZWNvdmVyYWJsZSBlcnJvcnNcbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLnRocm93KGVycm9yKTtcbiAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2YoXCJyZXRyeVwiKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGNhdGNoRXhwaXJlZFRva2VuKGVycm9yOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIGVycm9yID09PSBlcnJvckV4cGlyZWRUb2tlblxuICAgICAgICA/IE9ic2VydmFibGUub2YoXCJyZXRyeVwiKVxuICAgICAgICA6IE9ic2VydmFibGUudGhyb3coZXJyb3IpO1xuICAgIH1cblxuICAgIHByaXZhdGUgcG9sbGluZ0dldEFjdGl2aXR5JCgpIHtcbiAgICAgICAgY29uc3QgcG9sbGVyJDogT2JzZXJ2YWJsZTxBamF4UmVzcG9uc2U+ID0gT2JzZXJ2YWJsZS5jcmVhdGUoKHN1YnNjcmliZXI6IFN1YnNjcmliZXI8YW55PikgPT4ge1xuICAgICAgICAgICAgLy8gQSBCZWhhdmlvclN1YmplY3QgdG8gdHJpZ2dlciBwb2xsaW5nLiBTaW5jZSBpdCBpcyBhIEJlaGF2aW9yU3ViamVjdFxuICAgICAgICAgICAgLy8gdGhlIGZpcnN0IGV2ZW50IGlzIHByb2R1Y2VkIGltbWVkaWF0ZWx5LlxuICAgICAgICAgICAgY29uc3QgdHJpZ2dlciQgPSBuZXcgQmVoYXZpb3JTdWJqZWN0PGFueT4oe30pO1xuXG4gICAgICAgICAgICB0cmlnZ2VyJC5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNvbm5lY3Rpb25TdGF0dXMkLmdldFZhbHVlKCkgPT09IENvbm5lY3Rpb25TdGF0dXMuT25saW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXJ0VGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblxuICAgICAgICAgICAgICAgICAgICBPYnNlcnZhYmxlLmFqYXgoe1xuICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEFjY2VwdDogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC4uLnRoaXMuY29tbW9uSGVhZGVycygpXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybDogYCR7IHRoaXMuZG9tYWluIH0vY29udmVyc2F0aW9ucy8keyB0aGlzLmNvbnZlcnNhdGlvbklkIH0vYWN0aXZpdGllcz93YXRlcm1hcms9JHsgdGhpcy53YXRlcm1hcmsgfWAsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lb3V0XG4gICAgICAgICAgICAgICAgICAgIH0pLnN1YnNjcmliZShcbiAgICAgICAgICAgICAgICAgICAgICAgIChyZXN1bHQ6IEFqYXhSZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1YnNjcmliZXIubmV4dChyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdHJpZ2dlciQubmV4dChudWxsKSwgTWF0aC5tYXgoMCwgdGhpcy5wb2xsaW5nSW50ZXJ2YWwgLSBEYXRlLm5vdygpICsgc3RhcnRUaW1lc3RhbXApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAoZXJyb3Iuc3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgNDAzOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25uZWN0aW9uU3RhdHVzJC5uZXh0KENvbm5lY3Rpb25TdGF0dXMuRXhwaXJlZFRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdHJpZ2dlciQubmV4dChudWxsKSwgdGhpcy5wb2xsaW5nSW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSA0MDQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb25TdGF0dXMkLm5leHQoQ29ubmVjdGlvblN0YXR1cy5FbmRlZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcHJvcGFnYXRlIHRoZSBlcnJvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Vic2NyaWJlci5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmNoZWNrQ29ubmVjdGlvbigpXG4gICAgICAgIC5mbGF0TWFwKF8gPT4gcG9sbGVyJFxuICAgICAgICAgICAgLmNhdGNoKCgpID0+IE9ic2VydmFibGUuZW1wdHk8QWpheFJlc3BvbnNlPigpKVxuICAgICAgICAgICAgLm1hcChhamF4UmVzcG9uc2UgPT4gYWpheFJlc3BvbnNlLnJlc3BvbnNlIGFzIEFjdGl2aXR5R3JvdXApXG4gICAgICAgICAgICAuZmxhdE1hcChhY3Rpdml0eUdyb3VwID0+IHRoaXMub2JzZXJ2YWJsZUZyb21BY3Rpdml0eUdyb3VwKGFjdGl2aXR5R3JvdXApKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvYnNlcnZhYmxlRnJvbUFjdGl2aXR5R3JvdXAoYWN0aXZpdHlHcm91cDogQWN0aXZpdHlHcm91cCkge1xuICAgICAgICBpZiAoYWN0aXZpdHlHcm91cC53YXRlcm1hcmspXG4gICAgICAgICAgICB0aGlzLndhdGVybWFyayA9IGFjdGl2aXR5R3JvdXAud2F0ZXJtYXJrO1xuICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5mcm9tKGFjdGl2aXR5R3JvdXAuYWN0aXZpdGllcyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB3ZWJTb2NrZXRBY3Rpdml0eSQoKTogT2JzZXJ2YWJsZTxBY3Rpdml0eT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGVja0Nvbm5lY3Rpb24oKVxuICAgICAgICAuZmxhdE1hcChfID0+XG4gICAgICAgICAgICB0aGlzLm9ic2VydmFibGVXZWJTb2NrZXQ8QWN0aXZpdHlHcm91cD4oKVxuICAgICAgICAgICAgLy8gV2ViU29ja2V0cyBjYW4gYmUgY2xvc2VkIGJ5IHRoZSBzZXJ2ZXIgb3IgdGhlIGJyb3dzZXIuIEluIHRoZSBmb3JtZXIgY2FzZSB3ZSBuZWVkIHRvXG4gICAgICAgICAgICAvLyByZXRyaWV2ZSBhIG5ldyBzdHJlYW1VcmwuIEluIHRoZSBsYXR0ZXIgY2FzZSB3ZSBjb3VsZCBmaXJzdCByZXRyeSB3aXRoIHRoZSBjdXJyZW50IHN0cmVhbVVybCxcbiAgICAgICAgICAgIC8vIGJ1dCBpdCdzIHNpbXBsZXIganVzdCB0byBhbHdheXMgZmV0Y2ggYSBuZXcgb25lLlxuICAgICAgICAgICAgLnJldHJ5V2hlbihlcnJvciQgPT4gZXJyb3IkLmRlbGF5KHRoaXMuZ2V0UmV0cnlEZWxheSgpKS5tZXJnZU1hcChlcnJvciA9PiB0aGlzLnJlY29ubmVjdFRvQ29udmVyc2F0aW9uKCkpKVxuICAgICAgICApXG4gICAgICAgIC5mbGF0TWFwKGFjdGl2aXR5R3JvdXAgPT4gdGhpcy5vYnNlcnZhYmxlRnJvbUFjdGl2aXR5R3JvdXAoYWN0aXZpdHlHcm91cCkpXG4gICAgfVxuXG4gICAgLy8gUmV0dXJucyB0aGUgZGVsYXkgZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzXG4gICAgcHJpdmF0ZSBnZXRSZXRyeURlbGF5KCkge1xuICAgICAgICByZXR1cm4gTWF0aC5mbG9vcigzMDAwICsgTWF0aC5yYW5kb20oKSAqIDEyMDAwKTtcbiAgICB9XG5cbiAgICAvLyBPcmlnaW5hbGx5IHdlIHVzZWQgT2JzZXJ2YWJsZS53ZWJTb2NrZXQsIGJ1dCBpdCdzIGZhaXJseSBvcGlvbmF0ZWQgIGFuZCBJIGVuZGVkIHVwIHdyaXRpbmdcbiAgICAvLyBhIGxvdCBvZiBjb2RlIHRvIHdvcmsgYXJvdW5kIHRoZWlyIGltcGxlbWVudGlvbiBkZXRhaWxzLiBTaW5jZSBXZWJDaGF0IGlzIG1lYW50IHRvIGJlIGEgcmVmZXJlbmNlXG4gICAgLy8gaW1wbGVtZW50YXRpb24sIEkgZGVjaWRlZCByb2xsIHRoZSBiZWxvdywgd2hlcmUgdGhlIGxvZ2ljIGlzIG1vcmUgcHVycG9zZWZ1bC4gLSBAYmlsbGJhXG4gICAgcHJpdmF0ZSBvYnNlcnZhYmxlV2ViU29ja2V0PFQ+KCkge1xuICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5jcmVhdGUoKHN1YnNjcmliZXI6IFN1YnNjcmliZXI8VD4pID0+IHtcbiAgICAgICAgICAgIGtvbnNvbGUubG9nKFwiY3JlYXRpbmcgV2ViU29ja2V0XCIsIHRoaXMuc3RyZWFtVXJsKTtcbiAgICAgICAgICAgIGNvbnN0IHdzID0gbmV3IFdlYlNvY2tldCh0aGlzLnN0cmVhbVVybCk7XG4gICAgICAgICAgICBsZXQgc3ViOiBTdWJzY3JpcHRpb247XG5cbiAgICAgICAgICAgIHdzLm9ub3BlbiA9IG9wZW4gPT4ge1xuICAgICAgICAgICAgICAgIGtvbnNvbGUubG9nKFwiV2ViU29ja2V0IG9wZW5cIiwgb3Blbik7XG4gICAgICAgICAgICAgICAgLy8gQ2hyb21lIGlzIHByZXR0eSBiYWQgYXQgbm90aWNpbmcgd2hlbiBhIFdlYlNvY2tldCBjb25uZWN0aW9uIGlzIGJyb2tlbi5cbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSBwZXJpb2RpY2FsbHkgcGluZyB0aGUgc2VydmVyIHdpdGggZW1wdHkgbWVzc2FnZXMsIGl0IGhlbHBzIENocm9tZVxuICAgICAgICAgICAgICAgIC8vIHJlYWxpemUgd2hlbiBjb25uZWN0aW9uIGJyZWFrcywgYW5kIGNsb3NlIHRoZSBzb2NrZXQuIFdlIHRoZW4gdGhyb3cgYW5cbiAgICAgICAgICAgICAgICAvLyBlcnJvciwgYW5kIHRoYXQgZ2l2ZSB1cyB0aGUgb3Bwb3J0dW5pdHkgdG8gYXR0ZW1wdCB0byByZWNvbm5lY3QuXG4gICAgICAgICAgICAgICAgc3ViID0gT2JzZXJ2YWJsZS5pbnRlcnZhbCh0aW1lb3V0KS5zdWJzY3JpYmUoXyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3cy5zZW5kKFwiXCIpXG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga29uc29sZS5sb2coXCJQaW5nIGVycm9yXCIsIGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdzLm9uY2xvc2UgPSBjbG9zZSA9PiB7XG4gICAgICAgICAgICAgICAga29uc29sZS5sb2coXCJXZWJTb2NrZXQgY2xvc2VcIiwgY2xvc2UpO1xuICAgICAgICAgICAgICAgIGlmIChzdWIpIHN1Yi51bnN1YnNjcmliZSgpO1xuICAgICAgICAgICAgICAgIHN1YnNjcmliZXIuZXJyb3IoY2xvc2UpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3cy5vbm1lc3NhZ2UgPSBtZXNzYWdlID0+IG1lc3NhZ2UuZGF0YSAmJiBzdWJzY3JpYmVyLm5leHQoSlNPTi5wYXJzZShtZXNzYWdlLmRhdGEpKTtcblxuICAgICAgICAgICAgLy8gVGhpcyBpcyB0aGUgJ3Vuc3Vic2NyaWJlJyBtZXRob2QsIHdoaWNoIGlzIGNhbGxlZCB3aGVuIHRoaXMgb2JzZXJ2YWJsZSBpcyBkaXNwb3NlZC5cbiAgICAgICAgICAgIC8vIFdoZW4gdGhlIFdlYlNvY2tldCBjbG9zZXMgaXRzZWxmLCB3ZSB0aHJvdyBhbiBlcnJvciwgYW5kIHRoaXMgZnVuY3Rpb24gaXMgZXZlbnR1YWxseSBjYWxsZWQuXG4gICAgICAgICAgICAvLyBXaGVuIHRoZSBvYnNlcnZhYmxlIGlzIGNsb3NlZCBmaXJzdCAoZS5nLiB3aGVuIHRlYXJpbmcgZG93biBhIFdlYkNoYXQgaW5zdGFuY2UpIHRoZW5cbiAgICAgICAgICAgIC8vIHdlIG5lZWQgdG8gbWFudWFsbHkgY2xvc2UgdGhlIFdlYlNvY2tldC5cbiAgICAgICAgICAgIHJldHVybiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHdzLnJlYWR5U3RhdGUgPT09IDAgfHwgd3MucmVhZHlTdGF0ZSA9PT0gMSkgd3MuY2xvc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkgYXMgT2JzZXJ2YWJsZTxUPlxuICAgIH1cblxuICAgIHByaXZhdGUgcmVjb25uZWN0VG9Db252ZXJzYXRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoZWNrQ29ubmVjdGlvbih0cnVlKVxuICAgICAgICAuZmxhdE1hcChfID0+XG4gICAgICAgICAgICBPYnNlcnZhYmxlLmFqYXgoe1xuICAgICAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgICAgICAgICB1cmw6IGAke3RoaXMuZG9tYWlufS9jb252ZXJzYXRpb25zLyR7dGhpcy5jb252ZXJzYXRpb25JZH0/d2F0ZXJtYXJrPSR7dGhpcy53YXRlcm1hcmt9YCxcbiAgICAgICAgICAgICAgICB0aW1lb3V0LFxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJBY2NlcHRcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgICAgICAgICAgICAgIC4uLnRoaXMuY29tbW9uSGVhZGVycygpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5kbyhyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zZWNyZXQpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW4gPSByZXN1bHQucmVzcG9uc2UudG9rZW47XG4gICAgICAgICAgICAgICAgdGhpcy5zdHJlYW1VcmwgPSByZXN1bHQucmVzcG9uc2Uuc3RyZWFtVXJsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5tYXAoXyA9PiBudWxsKVxuICAgICAgICAgICAgLnJldHJ5V2hlbihlcnJvciQgPT4gZXJyb3IkXG4gICAgICAgICAgICAgICAgLm1lcmdlTWFwKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNDAzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0b2tlbiBoYXMgZXhwaXJlZC4gV2UgY2FuJ3QgcmVjb3ZlciBmcm9tIHRoaXMgaGVyZSwgYnV0IHRoZSBlbWJlZGRpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlYnNpdGUgbWlnaHQgZXZlbnR1YWxseSBjYWxsIHJlY29ubmVjdCgpIHdpdGggYSBuZXcgdG9rZW4gYW5kIHN0cmVhbVVybC5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXhwaXJlZFRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXJyb3Iuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLnRocm93KGVycm9yQ29udmVyc2F0aW9uRW5kZWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2YoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmRlbGF5KHRpbWVvdXQpXG4gICAgICAgICAgICAgICAgLnRha2UocmV0cmllcylcbiAgICAgICAgICAgIClcbiAgICAgICAgKVxuICAgIH1cblxuICAgIHByaXZhdGUgY29tbW9uSGVhZGVycygpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBgQmVhcmVyICR7dGhpcy50b2tlbn1gLFxuICAgICAgICAgICAgXCJ4LW1zLWJvdC1hZ2VudFwiOiB0aGlzLl9ib3RBZ2VudFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0Qm90QWdlbnQoY3VzdG9tQWdlbnQ6IHN0cmluZyA9ICcnKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IGNsaWVudEFnZW50ID0gJ2RpcmVjdGxpbmVqcydcblxuICAgICAgICBpZiAoY3VzdG9tQWdlbnQpIHtcbiAgICAgICAgICAgIGNsaWVudEFnZW50ICs9IGA7ICR7Y3VzdG9tQWdlbnR9YFxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGAke0RJUkVDVF9MSU5FX1ZFUlNJT059ICgke2NsaWVudEFnZW50fSlgO1xuICAgIH1cbn1cbiJdfQ==