var sys = require('util'),
    http = require('http'),
    Q = require('q'),
    restify = require('restify');

var apiVersion = (Config && ('FiFo' in Config) && Config.FiFo.length) ? Config.FiFo[0].version : '0.1.0',
    savedToken = {},
    savedUsername = null,
    savedPassword = null,
    tokenReuseLimit = 80,
    tokenReuseCount = 0,
    connectionTimeout = 1000,
    connectionStrings = {
        success: 'Connectivity confirmed!',
        error: 'Connectivity not found.',
        timeout: 'Endpoint timeout, trying next endpoint..'
    },
    defaultFifoPath = '/api/' + apiVersion,
    fifoPath = {};

function handleError(token, err, req, res) {
    var deferred = Q.defer();
    console.log("Endpoint: ", token);
    console.log("Error information: ", err);
    console.log("Request details: ", req ? req._headers : req, req ? req.body : req);
    console.log("Result details: ", res ? res.headers : res);
    // console.trace(err);
    if ((err.code == 'ECONNRESET') || (err.statusCode == 403) || (err.statusCode == 404) || (err.statusCode == 500) || (err.statusCode == 503) || (err.code == 'EMFILE'))
        deferred.resolve([err.statusCode]);
    else
        deferred.reject(new Error(err));

    return deferred.promise;
}

function client(endpoint) {
    var pattern = /^(https?:\/\/)([\d|.]+)[:]?(\d+)?(\/.*)*?$/,
        matches = endpoint.match(pattern);

    if (typeof(matches[4]) !== 'undefined') {
        fifoPath[endpoint] = matches[4] + defaultFifoPath;
        endpoint = matches[1] + matches[2];
    } else {
        fifoPath[endpoint] = defaultFifoPath;
    }
    // console.log('!client!', matches, fifoPath, endpoint);

    return restify.createJsonClient({
        rejectUnauthorized: false,
        url: endpoint
    });
}

function stringClient(endpoint) {
    var pattern = /^(https?:\/\/)([\d|.]+)[:]?(\d+)?(\/.*)*?$/,
        matches = endpoint.match(pattern);

    if (typeof(matches[4]) !== 'undefined') {
        fifoPath[endpoint] = matches[4] + defaultFifoPath;
        endpoint = matches[1] + matches[2];
    } else {
        fifoPath[endpoint] = defaultFifoPath;
    }
    // console.log('!client!', matches, fifoPath, endpoint);

    return restify.createStringClient({
        rejectUnauthorized: false,
        url: endpoint
    });
}

function get(path, token, extraHeaders) {
    var deferred = Q.defer(),
        c = client(token.endpoint),
        headers = {
            'x-snarl-token': token.token,
            'Authorization': 'Bearer ' + token.token
        };
    if (!extraHeaders)
        extraHeaders = {};
    else
        for (key in extraHeaders)
            headers[key] = extraHeaders[key];
    // console.log('Connecting to:', fifoPath[token.endpoint] + path);
    c.get({
        path: fifoPath[token.endpoint] + path,
        headers: headers
    }, function(err, req, res, obj) {
        if (err) {
            if (!req['x-snarl-token']) {
                // if one of the endpoints is down, don't kill the entire server, the others might be fine.
                deferred.resolve({});
            } else {
                console.log('Error trying to retrieve: ' + path);
                handleError(token, err, req, res)
                    .then(function(data) {
                        deferred.resolve(data);
                    }, function(err) {
                        deferred.reject(new Error(err));
                    });
            }
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
}

function getFull(path, token) {
    return get(path, token, {
        'x-full-list': true
    });
}

function del(path, token) {
    var deferred = Q.defer();
    var c = client(token.endpoint);
    c.del({
        path: fifoPath[token.endpoint] + path,
        headers: {
            'x-snarl-token': token.token,
            'Authorization': 'Bearer ' + token.token
        }
    }, function(err, req, res, obj) {
        if (err) {
            handleError(token, err, req, res)
                .then(function(data) {
                    deferred.resolve(data);
                }, function(err) {
                    deferred.reject(new Error(err));
                });
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
}

function post(path, body, token) {
    var deferred = Q.defer();
    var deferred2 = Q.defer();
    var c = client(token.endpoint);
    console.log('Post request to:', fifoPath[token.endpoint] + path, body);
    c.post({
        path: fifoPath[token.endpoint] + path,
        headers: {
            'x-snarl-token': token.token,
            'Authorization': 'Bearer ' + token.token
        }
    }, body, function(err, req, res, obj) {
        if (err) {
            handleError(token, err, req, res)
                .then(function(data) {
                    deferred.resolve(data);
                }, function(err) {
                    deferred.reject(new Error(err));
                });
        } else {
            deferred.resolve(res.headers['location']);
        }
    });
    deferred.promise.then(function(location) {
        // console.log(location);
        if ((typeof(location) === 'object') && (location instanceof Array)) {
            deferred2.resolve([new Error('Error code ' + (location.length ? location[0] : 'unknown') + ' returned.')]);
        }
        c.get({
            path: location,
            headers: {
                'x-snarl-token': token.token,
                'Authorization': 'Bearer ' + token.token
            }
        }, function(err, req, res, obj) {
            if (err) {
                handleError(token, err, req, res)
                    .then(function(data) {
                        deferred2.resolve(data);
                    }, function(err) {
                        deferred2.reject(new Error(err));
                    });
            } else {
                deferred2.resolve(obj);
            }
        });
    }, function(err) {
        deferred2.resolve(err);
    });
    return deferred2.promise;
}

function put(path, body, token) {
    var deferred = Q.defer();
    var c = client(token.endpoint);
    c.put({
        path: fifoPath[token.endpoint] + path,
        headers: {
            'x-snarl-token': token.token,
            'Authorization': 'Bearer ' + token.token
        }
    }, body, function(err, req, res, obj) {
        if (err) {
            handleError(token, err, req, res)
                .then(function(data) {
                    deferred.resolve(data);
                }, function(err) {
                    deferred.reject(new Error(err));
                });
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
}

function metadataSet(where, id, key, value, token) {
    var o = {};
    var path;
    if (typeof(key) == "string") {
        o[key] = value;
        path = "/" + where + "/" + id + "/metadata";
    } else {
        path = key;
        key = path.pop();
        o[key] = value;
        path = "/" + where + "/" + id + "/metadata/" + path.join("/");
    }
    return put(path, o, token);
}

function metadataDel(where, id, key, token) {
    var path = "/" + where + "/" + id + "/metadata/";
    if (typeof(key) == "string")
        path += key;
    else
        path += key.join("/");
    return del(path, token);
}

function checkEndpoint(endpoint, fifo, callback) {
    try {
        var pattern = /^(https?:\/\/)([\d|.]+)(:(\d+))?(\/.*)*?$/,
            matches = endpoint.match(pattern);

        // console.log(endpoint, fifo, matches);
        if (matches === null)
            return false;

        var secure = (matches[1] === "https://"),
            port = matches[4] ? matches[4] : secure ? 443 : 80,
            host = matches[2],
            path = (matches[5] !== undefined) ? matches[5] : '',
            options = {
                host: host,
                port: port,
                path: fifo ? path + defaultFifoPath + '/cloud/connection' : path + '/tasks/all'
            }
        options.endpoint = matches[1] + host + ':' + port + options.path;

        // console.log(options);
        testPort(options, callback);

        var calledbackOnce = false;

        function testPort(options, callback) {
            // console.log('Testing endpoint: ', options.endpoint);
            var timeoutWrapper = function(req) {
                return function() {
                    // do some logging, cleaning, etc. depending on req
                    console.log(connectionStrings.timeout);
                    req.abort();
                    if (!calledbackOnce) {
                        calledBackOnce = true;
                        callback(false);
                    }
                };
            },
                request = http.get(options.endpoint, function(res) {
                    var responseParts = [];
                    res.setEncoding('utf8');
                    res.on("error", function(err) {
                        clearTimeout(timeout);
                        console.log(connectionStrings.error, err);
                        if (!calledbackOnce) {
                            calledBackOnce = true;
                            setTimeout(function() {
                                callback(false);
                            }, 1);
                        }
                    });
                    res.on("data", function(chunk) {
                        clearTimeout(timeout);
                        if (!calledbackOnce) {
                            calledBackOnce = true;
                            console.log(connectionStrings.success); //, chunk);
                            callback(true);
                        }
                    });
                    res.on("end", function() {
                        clearTimeout(timeout);
                    });
                }),
                fn = timeoutWrapper(request),
                timeout = setTimeout(fn, connectionTimeout);
            request.on("error", function(err) {
                // we just don't want the server to crash
                // otherwise, we don't care about this error..
            });
        }
    } catch (err) {
        console.log('checkEndpoint error:', err);
    }
}

FiFo = {
    resetSaved: function() {
        savedUsername = null;
        savedPassword = null;

    },
    connect: function(endpoint, user, password, saveDisabled) {
        var deferred = Q.defer();
        console.log('Checking endpoint:', endpoint, 'saveDisabled: ', saveDisabled);
        checkEndpoint(endpoint, true, function(worked) {
            if (!worked) {
                deferred.resolve({
                    user: -1,
                    endpoint: endpoint
                });
            } else {
                if (!saveDisabled) {
                    if (user in savedToken) {
                        // if (++tokenReuseCount <= tokenReuseLimit)
                        // {
                        //     savedToken = null;
                        //     savedUsername = null;
                        //     savedPassword = null;
                        //     tokenReuseCount = 0;
                        // }
                        if ((savedUsername == user) && (savedPassword == password)) {
                            deferred.resolve(savedToken[user]);
                            return deferred.promise;
                        } else {
                            delete savedToken[user];
                            savedUsername = null;
                            savedPassword = null;
                        }
                    }
                }
                var item1 = function() {
                    var deferredA = Q.defer();
                    var c = stringClient(endpoint);
                    console.log('Logging into:', fifoPath[endpoint] + "/oauth/token");
                    c.post(fifoPath[endpoint] + "/oauth/token",
                    {
                        "grant_type": 'password',
                        "username": user,
                        "password": password
                    }, function(err, req, res, obj) {
                        if (err) {
                            console.log('Error information:', err.statusCode, (err.statusCode / 100).toFixed(0));
                            if (((err.statusCode / 100).toFixed(0) == 4) || ((err.statusCode / 100).toFixed(0) == 5)) {
                                deferredA.resolve({
                                    loginFailure: true
                                });
                            } else {
                                handleError(endpoint, err, req, res)
                                    .then(function(data) {
                                        deferredA.resolve(data);
                                    }, function(err) {
                                        deferredA.reject(new Error(err));
                                    });
                            }
                        } else {
                            // console.log(res.headers, res.body);
                            var location = '',
                                token = '',
                                bodyParsed = JSON.parse(res.body);
                            if ('x-snarl-token' in res.headers) {
                                location = res.headers['location'];
                                token = res.headers['x-snarl-token'];
                            } else if ('access_token' in bodyParsed) {
                                location = fifoPath[endpoint].replace(/^\/[^\/]+/, '') + '/sessions';
                                token = bodyParsed['access_token'];
                            }
                            var interimToken = {
                                location: location,
                                token: token,
                                loginFailure: false
                            };
                            // console.log(interimToken);
                            deferredA.resolve(interimToken);
                        }
                    });
                    return deferredA.promise;
                },
                    item2 = function(res) {
                        var deferredB = Q.defer();
                        if (res.loginFailure) {
                            deferredB.resolve({
                                user: -1,
                                endpoint: endpoint
                            });
                        } else {
                            var c = client(endpoint),
                                savedToken = res.token;
                            console.log('Logging in, phase 2:', res.location);
                            if (res.location.substr(0, 4) !== 'http') {
                                console.log('.. adding host', endpoint);
                                res.location = endpoint + res.location;
                            }
                            c.get({
                                path: res.location,
                                headers: {
                                    'x-snarl-token': res.token,
                                    'Authorization': 'Bearer ' + res.token
                                }
                            }, function(err, req, res, obj) {
                                // console.log(res.headers, res.body);
                                if (err) {
                                    console.log('Phase 2 failed.');
                                    handleError(endpoint, err, req, res)
                                        .then(function(data) {
                                            deferredB.resolve(data);
                                        }, function(err) {
                                            deferredB.reject(new Error(err));
                                        });
                                } else {
                                    console.log('Phase 2 success.');
                                    var tokenObject = {
                                        token: savedToken,
                                        user: obj,
                                        endpoint: endpoint
                                    };
                                    if (!saveDisabled) {
                                        savedToken[user] = tokenObject;
                                        savedUsername = user;
                                        savedPassword = password;
                                    }
                                    // console.log(tokenObject);
                                    deferredB.resolve(tokenObject);
                                }
                            });
                        }
                        return deferredB.promise;
                    };
                item1()
                    .then(function(data) {
                        deferred.resolve(item2(data));
                    }, function(err) {
                        //console.trace(err.stack);
                        deferred.reject(err);
                    });
            }
        });
        return deferred.promise;
    },
    signup: function(endpoint, dataStruct) {
        var deferred = Q.defer(),
            c = client(endpoint),
            doneOnce = false;
        console.log('Signing up:', endpoint + "/dozer", JSON.stringify(dataStruct));
        checkEndpoint(endpoint, false, function(worked) {
            if (worked) {
                if (!doneOnce) {
                    doneOnce = true;
                    c.post(endpoint + "/dozer", dataStruct, function(err, req, res, obj) {
                        if (err) {
                            console.log('Error information:', err.statusCode, (err.statusCode / 100).toFixed(0));
                            if (((err.statusCode / 100).toFixed(0) == 4) || ((err.statusCode / 100).toFixed(0) == 5)) {
                                deferred.resolve({
                                    success: false,
                                    message: 'Sorry, the server returned error '+err.statusCode+'. Please try again later.'
                                });
                            } else {
                                deferred.reject(new Error(err));
                            }
                        } else {
                            // console.log(res.body, res.headers);
                            deferred.resolve({
                                success: 'success',
                                location: res.headers.location,
                                status: res.body
                            });
                        }
                    });
                }
            } else {
                deferred.resolve({
                    success: false,
                    message: 'Connectivity error, please try again another time.'
                });
            }
        });
        return deferred.promise;
    },
    taskStatus: function(endpoint, dataStruct) {
        var deferred = Q.defer();
        var c = client(endpoint);
        console.log('Signing up:', endpoint + "/dozer", JSON.stringify(dataStruct));
        c.post(endpoint + "/dozer", dataStruct, function(err, req, res, obj) {
            if (err) {
                console.log('Error family:', (err.statusCode / 100).toFixed(0));
                if (((err.statusCode / 100).toFixed(0) == 4) || ((err.statusCode / 100).toFixed(0) == 5)) {
                    deferred.resolve({
                        success: false,
                        message: 'Error ' + err.statusCode
                    });
                } else {
                    deferred.reject(new Error(err));
                }
            } else {
                // console.log(res.body, res.headers);
                deferred.resolve({
                    success: 'success',
                    location: res.headers.location,
                    status: res.body
                });
            }
        });
        return deferred.promise;
    },
    logout: function() {
        delete savedToken[savedUsername];
        savedUsername = null;
        savedPassword = null;
    },
    sessionTest: function(sessionid, token) {
        return get("/sessions/" + sessionid, token);
    },
    cloudStatus: function(endpoint) {
        var deferred = Q.defer(),
            c = client(endpoint),
            path = '/cloud/connection',
            connectionMade = false;
        // console.log('Checking connection at:', [endpoint] + path);
        setTimeout(function() {
            if (!connectionMade) {
                deferred.resolve({error: true, msg: 'Connection error!'});
            }
        }, 750);
        c.get(fifoPath[endpoint] + path, function(err, req, res, obj) {
            connectionMade = true;
            if (err) {
                // console.log('Error trying to retrieve: ' + path);
                handleError(token, err, req, res)
                    .then(function(data) {
                        deferred.resolve(data);
                    }, function(err) {
                        deferred.reject(new Error(err));
                    });
            } else {
                deferred.resolve(obj);
            }
        });
        return deferred.promise;
    }
};

var dcStruct = {
    list: [],
    ldata: {}
};

for (var i = 0; i < Config.FiFo.length; i++) {
    var tItem = Config.FiFo[i];
    dcStruct.list.push(tItem.dc);
    dcStruct.ldata[tItem.dc] = {
        name: tItem.dc,
        coreStats: {}
    };
}

Datacenter = {
    list: function(token) {
        var deferred = Q.defer();
        deferred.resolve(dcStruct.list);
        return deferred.promise;
    },
    listAll: function(token) {
        var deferred = Q.defer();
        deferred.resolve(dcStruct.ldata);
        return deferred.promise;
    },
    get: function(id, token) {
        var deferred = Q.defer();
        deferred.resolve((id in dcStruct.ldata) ? dcStruct.ldata[id] : {});
        return deferred.promise;
    }
};

User = {
    list: function(token) {
        return get("/users", token);
    },
    listAll: function(token) {
        return getFull("/users", token);
    },
    create: function(user, password, token) {
        return post("/users", {
            "user": user,
            "password": password
        }, token);
    },
    get: function(id, token) {
        return get("/users/" + id, token);
    },
    del: function(id, token) {
        return del("/users/" + id, token);
    },
    passwd: function(id, password, token) {
        return put("/users/" + id, {
            "password": password
        }, token);
    },
    listPerms: function(id, token) {
        return get("/users/" + id + "/permissions", token);
    },
    grant: function(id, permission, token) {
        return put("/users/" + id + "/permissions/" + permission.join("/"), {}, token);
    },
    revoke: function(id, permission, token) {
        return del("/users/" + id + "/permissions/" + permission.join("/"), token);
    },
    listRoles: function(id, token) {
        return get("/users/" + id + "/roles", token);
    },
    joinRole: function(id, role, token) {
        return put("/users/" + id + "/roles/" + role, {}, token);
    },
    leaveRole: function(id, role, token) {
        return del("/users/" + id + "/roles/" + role, token);
    },
    listOrgs: function(id, token) {
        return get("/users/" + id + "/orgs", token);
    },
    joinOrg: function(id, org, token) {
        return put("/users/" + id + "/orgs/" + org, {}, token);
    },
    activeOrg: function(id, org, token) {
        return put("/users/" + id + "/orgs/" + org, {
            "active": true
        }, token);
    },
    leaveOrg: function(id, org, token) {
        return del("/users/" + id + "/orgs/" + org, token);
    },
    listKeys: function(id, token) {
        return get("/users/" + id + "/keys", token);
    },
    addKey: function(id, keyid, key, token) {
        var o = {};
        o[keyid] = key;
        return put("/users/" + id + "/keys", o, token);
    },
    deleteKey: function(id, keyid, token) {
        return del("/users/" + id + "/keys/" + keyid, token);
    },
    listYubikeys: function(id, token) {
        return get("/users/" + id + "/yubikeys", token);
    },
    addYubikey: function(id, key, token) {
        var o = {
            'otp': key
        };
        return put("/users/" + id + "/yubikeys", o, token);
    },
    deleteYubikey: function(id, keyid, token) {
        return del("/users/" + id + "/yubikeys/" + keyid, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("users", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("users", id, path, token);
    }
};

Role = {
    list: function(token) {
        return get("/roles", token);
    },
    listAll: function(token) {
        return getFull("/roles", token);
    },
    create: function(name, token) {
        return post("/roles", {
            "name": name
        }, token);
    },
    get: function(id, token) {
        return get("/roles/" + id, token);
    },
    del: function(id, token) {
        return del("/roles/" + id, token);
    },
    listPerms: function(id, token) {
        return get("/roles/" + id + "/permissions", token);
    },
    grant: function(id, permission, token) {
        return put("/roles/" + id + "/permissions/" + permission.join("/"), {}, token);
    },
    revoke: function(id, permission, token) {
        return del("/roles/" + id + "/permissions/" + permission.join("/"), token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("roles", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("roles", id, path, token);
    }
};

Organization = {
    list: function(token) {
        return get("/orgs", token);
    },
    listAll: function(token) {
        return getFull("/orgs", token);
    },
    create: function(name, token) {
        return post("/orgs", {
            "name": name
        }, token);
    },
    get: function(id, token) {
        return get("/orgs/" + id, token);
    },
    del: function(id, token) {
        return del("/orgs/" + id, token);
    },
    listTriggers: function(id, token) {
        return get("/orgs/" + id + "/triggers", token);
    },
    addTrigger: function(id, triggerRole, triggerPayload, token) {
        return put("/orgs/" + id + "/triggers/" + triggerRole, triggerPayload, token);
    },
    removeTrigger: function(id, triggerRole, triggerPayload, token) {
        console.error("Not working properly yet");
        // throw Error("Not supported");
        return del("/orgs/" + id + "/triggers/" + triggerRole, triggerPayload, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("orgs", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("orgs", id, path, token);
    }
};

Hypervisor = {
    list: function(token) {
        return get("/hypervisors", token);
    },
    listAll: function(token) {
        return getFull("/hypervisors", token);
    },
    get: function(id, token) {
        return get("/hypervisors/" + id, token);
    },
    alias: function(id, alias, token) {
        return put("/hypervisors/" + id + "/config", {
            "alias": alias
        }, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("hypervisors", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("hypervisors", id, path, token);
    },
    characteristicSet: function(id, key, value, token) {
        var path = "/hypervisors/" + id + "/characteristics";
        var o = {};
        o[key] = value;
        return put(path, o, token);
    },
    characteristicDel: function(id, key, token) {
        var path = "/hypervisors/" + id + "/characteristics/" + key;
        return del(path, token);
    }
}

VM = {
    list: function(token) {
        return get("/vms", token);
    },
    listAll: function(token) {
        return getFull("/vms", token);
    },
    create: function(dataset, pkg, config, token) {
        return post("/vms", {
            "dataset": dataset,
            "package": pkg,
            "config": config
        }, token);
    },
    get: function(id, token) {
        return get("/vms/" + id, token);
    },
    action: function(id, action, token) {
        return put("/vms/" + id, {
            "action": action
        }, token);
    },
    start: function(id, token) {
        return VM.action(id, "start", token);
    },
    stop: function(id, token) {
        return VM.action(id, "stop", token);
    },
    reboot: function(id, token) {
        return VM.action(id, "reboot", token);
    },
    forceAction: function(id, action, token) {
        return put("/vms/" + id, {
            "action": action,
            "force": true
        }, token);
    },
    forceStop: function(id, token) {
        return VM.forceAction(id, "stop", token);
    },
    forceReboot: function(id, token) {
        return VM.forceAction(id, "reboot", token);
    },
    update: function(id, config, token) {
        return put("/vms/" + id, config, token);
    },
    del: function(id, token) {
        return del("/vms/" + id, token);
    },
    nicAdd: function(vm, mac, token) {
        return post("/vms/" + vm + "/nics", {
            "network": mac
        }, token);
    },
    nicMakePrimary: function(vm, mac, token) {
        return put("/vms/" + vm + "/nics/" + mac, {
            "primary": true
        }, token);
    },
    nicDel: function(vm, mac, token) {
        return del("/vms/" + vm + "/nics/" + mac, token);
    },
    snapshotsList: function(vm, token) {
        return get("/vms/" + vm + "/snapshots", token);
    },
    snapshotsCreate: function(vm, comment, token) {
        return post("/vms/" + vm + "/snapshots", {
            "comment": comment
        }, token);
    },
    snapshotsGet: function(vm, snap, token) {
        return get("/vms/" + vm + "/snapshots/" + snap, token);
    },
    snapshotsRollback: function(vm, snap, token) {
        return put("/vms/" + vm + "/snapshots/" + snap, {
            "action": "rollback"
        }, token);
    },
    snapshotsDel: function(vm, snap, token) {
        return del("/vms/" + vm + "/snapshots/" + snap, token);
    },
    backupsList: function(vm, token) {
        return get("/vms/" + vm + "/backups", token);
    },
    backupsCreate: function(vm, comment, token) {
        return post("/vms/" + vm + "/backups", {
            "comment": comment
        }, token);
    },
    backupsGet: function(vm, snap, token) {
        return get("/vms/" + vm + "/backups/" + snap, token);
    },
    backupsRollback: function(vm, snap, token) {
        return put("/vms/" + vm + "/backups/" + snap, {
            "action": "rollback"
        }, token);
    },
    backupsDel: function(vm, snap, token) {
        return del("/vms/" + vm + "/backups/" + snap, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("vms", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("vms", id, path, token);
    }
};

Network = {
    list: function(token) {
        return get("/networks", token);
    },
    listAll: function(token) {
        return getFull("/networks", token);
    },
    create: function(name, token) {
        return post("/networks", {
            "name": name
        }, token);
    },
    get: function(id, token) {
        return get("/networks/" + id, token);
    },
    del: function(id, token) {
        return del("/networks/" + id, token);
    },
    addIprange: function(net, iprange, token) {
        return put("/networks/" + net + "/ipranges/" + iprange, {}, token);
    },
    deleteIprange: function(net, iprange, token) {
        return del("/networks/" + net + "/ipranges/" + iprange, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("networks", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("networks", id, path, token);
    }
};

IPrange = {
    list: function(token) {
        return get("/ipranges", token);
    },
    listAll: function(token) {
        return getFull("/ipranges", token);
    },
    create: function(tag, name, network, gateway, netmask, first, last, vlan, token) {
        return post("/ipranges", {
            "tag": tag,
            "name": name,
            "network": network,
            "gateway": gateway,
            "netmask": netmask,
            "first": first,
            "last": last,
            "vlan": vlan
        }, token);
    },
    get: function(id, token) {
        return get("/ipranges/" + id, token);
    },
    del: function(id, token) {
        return del("/ipranges/" + id, token);
    },
    obtainIp: function(id, token) {
        console.error("Not implemented in project-fifo yet. **Postponed**");
        return post("/ipranges/" + id, {}, token);
    },
    releaseIp: function(id, ip, token) {
        console.error("Not implemented in project-fifo yet. **Postponed**");
        return del("/ipranges/" + id + "/" + ip, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("ipranges", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("ipranges", id, path, token);
    }
}

Dataset = {
    list: function(token) {
        return get("/datasets", token);
    },
    listAll: function(token) {
        return getFull("/datasets", token);
    },
    create: function(url, token) {
        return post("/datasets", {
            "url": url
        }, token);
    },
    get: function(id, token) {
        return get("/datasets/" + id, token);
    },
    del: function(id, token) {
        return del("/datasets/" + id, token);
    },
    set: function(id, key, value, token) {
        var o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/datasets/" + id;
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/datasets/" + id + "/" + path.join("/");
        }
        return put(path, o, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("datasets", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("datasets", id, path, token);
    }
};

Package = {
    list: function(token) {
        return get("/packages", token);
    },
    listAll: function(token) {
        return getFull("/packages", token);
    },
    create: function(name, ram, quota, cpuCap, requirements, token) {
        return post("/packages", {
            "name": name,
            "ram": ram,
            "quota": quota,
            "cpu_cap": cpuCap,
            "requirements": requirements
        }, token);
    },
    get: function(id, token) {
        return get("/packages/" + id, token);
    },
    del: function(id, token) {
        return del("/packages/" + id, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("packages", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("packages", id, path, token);
    }
};

Dtrace = {
    list: function(token) {
        return get("/dtrace", token);
    },
    listAll: function(token) {
        return getFull("/dtrace", token);
    },
    create: function(name, script, config, token) {
        return post("/dtrace", {
            "name": name,
            "script": script,
            "config": config
        }, token);
    },
    get: function(id, token) {
        return get("/dtrace/" + id, token);
    },
    del: function(id, token) {
        return del("/dtrace/" + id, token);
    },
    createPut: function(id, name, script, config, token) {
        console.error("Not implemented in project-fifo yet.");
        return put("/dtrace/" + id, {
            "name": name,
            "script": script,
            "config": config
        }, token);
    },
    metadataSet: function(id, key, value, token) {
        return metadataSet("dtrace", id, key, value, token);
    },
    metadataDel: function(id, path, token) {
        return metadataDel("dtrace", id, path, token);
    }
};
