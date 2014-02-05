var sys = require('util'),
    http = require('http'),
    Q = require('q'),
    restify = require('restify');

var version = '0.1.0',
    saved_token = {},
    saved_username = null,
    saved_password = null,
    token_reuse_limit = 80,
    token_reuse_count = 0,
    connection_timeout = 1000,
    connection_timeout_string = 'timeout detected!',
    defaultFifoPath = '/api/0.1.0',
    fifoPath = {};

function handleError(err, req, res)
{
    var deferred = Q.defer();
    console.log("Error information: ", err);
    console.log("Request details: ", req ? req._headers : req);
    console.log("Result details: ", res ? res.headers : res);
    // console.trace(err);
    if ((err.code == 'ECONNRESET') || (err.statusCode == 403) || (err.statusCode == 404) || (err.statusCode == 500) || (err.statusCode == 503) || (err.code == 'EMFILE'))
        deferred.resolve([]);
    else
        deferred.reject(new Error(err));

    return deferred.promise;
}

function client(endpoint) {
    var pattern = /^(https?:\/\/)([\d|.]+)(\/.*)*?$/,
        matches = endpoint.match(pattern);

    if (typeof(matches[3]) !== 'undefined') {
        fifoPath[endpoint] = matches[3] + defaultFifoPath;
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

function get(path, token, extraHeaders) {
    var deferred = Q.defer(),
        c = client(token.endpoint),
        headers = {'x-snarl-token': token.token};
    if (!extraHeaders)
        extraHeaders = {};
    else
        for(key in extraHeaders)
            headers[key] = extraHeaders[key];
    c.get({
        path: fifoPath[token.endpoint] + path,
        headers: headers
    }, function(err, req, res, obj) {
        if (err) {
            if (!req['x-snarl-token']) {
                // if one of the endpoints is down, don't kill the entire server, the others might be fine.
                deferred.resolve({});
            } else {
                console.log('Error trying to retrieve: '+path);
                handleError(err, req, res)
                .then(function(data){
                    deferred.resolve(data);
                }, function(err){
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
    return get(path, token, {'x-full-list': true});
}

function del(path, token) {
    var deferred = Q.defer();
    var c = client(token.endpoint);
    c.del({
        path: fifoPath[token.endpoint] + path,
        headers: {
            'x-snarl-token': token.token
        }
    }, function(err, req, res, obj) {
        if (err) {
            handleError(err, req, res)
            .then(function(data){
                deferred.resolve(data);
            }, function(err){
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
    c.post({
        path: fifoPath[token.endpoint] + path,
        headers: {
            'x-snarl-token': token.token
        }
    }, body, function(err, req, res, obj) {
        if (err) {
            handleError(err, req, res)
            .then(function(data){
                deferred.resolve(data);
            }, function(err){
                deferred.reject(new Error(err));
            });
        } else {
            deferred.resolve(res.headers['location']);
        }
    });
    deferred.promise.then(function(location) {
        c.get({
            path: location,
            headers: {
                'x-snarl-token': token.token
            }
        }, function(err, req, res, obj) {
            if (err) {
                handleError(err, req, res)
                .then(function(data){
                    deferred2.resolve(data);
                }, function(err){
                    deferred2.reject(new Error(err));
                });
            } else {
                deferred2.resolve(obj);
            }
        });
    }, function(err){
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
            'x-snarl-token': token.token
        }
    }, body, function(err, req, res, obj) {
        if (err) {
            handleError(err, req, res)
            .then(function(data){
                deferred.resolve(data);
            }, function(err){
                deferred.reject(new Error(err));
            });
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
}

function metadata_set(where, id, key, value, token) {
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

function metadata_del(where, id, key, token) {
    var path = "/" + where + "/" + id + "/metadata/";
    if (typeof(key) == "string")
        path += key;
    else
        path += key.join("/");
    return del(path, token);
}

function check_endpoint(endpoint, callback) {
    try {
        var pattern = /^(https?:\/\/)([\d|.]+)(\/.*)*?$/,
            matches = endpoint.match(pattern);

        // console.log(matches);

        if (matches === null)
            return false;

        var secure = (matches[1] === "https://"),
            port = secure ? 443 : 80,
            host = matches[2],
            path = (matches[3] !== undefined) ? matches[3] : '',
            options = {
                host: host,
                port: port,
                path: path + '/api/0.1.0/cloud/connection'
            };

        // console.log(options);

        testPort(options, callback);

        function testPort(options, cb) {
            var request = http.get(options, function(res) {
                cb(true, res); 
            }).on("error", function(e) {
                // console.log(e);
                cb(false, e);
            });
            request.setTimeout( connection_timeout, function() {
                console.log(connection_timeout_string);
                callback(false);
            });
        }
    } catch (err) {
        console.log(err);
    }
}

FiFo = {
    connect: function(endpoint, user, password, saveDisabled) {
        var deferred = Q.defer();
        console.log('checking endpoint '+endpoint);
        check_endpoint(endpoint, function(worked) {
            if (!worked) {
                deferred.resolve({
                    user: -1,
                    endpoint: endpoint
                });
            } else {
                if (!saveDisabled) {
                    if (user in saved_token)
                    {
                        // if (++token_reuse_count <= token_reuse_limit)
                        // {
                        //     saved_token = null;
                        //     saved_username = null;
                        //     saved_password = null;
                        //     token_reuse_count = 0;
                        // }
                        if ((saved_username == user) && (saved_password == password))
                        {
                            deferred.resolve(saved_token[user]);
                            return deferred.promise;
                        }
                        else
                        {
                            delete saved_token[user];
                            saved_username = null;
                            saved_password = null;
                        }
                    }
                }
                var item1 = function() {
                        var deferredA = Q.defer();
                        var c = client(endpoint);
                        c.post(fifoPath[endpoint] + "/sessions", {
                            "user": user,
                            "password": password
                        }, function(err, req, res, obj) {
                            if (err) {
                                if (err.statusCode == 401)
                                {
                                    deferredA.resolve({
                                        loginFailure: true
                                    });
                                }
                                else
                                {
                                    handleError(err, req, res)
                                    .then(function(data){
                                        deferredA.resolve(data);
                                    }, function(err){
                                        deferredA.reject(new Error(err));
                                    });
                                }
                            } else {
                                var interim_token = {
                                    location: res.headers['location'],
                                    token: res.headers['x-snarl-token'],
                                    loginFailure: false
                                };
                                deferredA.resolve(interim_token);
                            }
                        });
                        return deferredA.promise;
                    },
                    item2 = function(res) {
                        var deferredB = Q.defer();
                        if (res.loginFailure)
                        {
                            deferredB.resolve({
                                user: -1,
                                endpoint: endpoint
                            });
                        }
                        else
                        {
                            var c = client(endpoint);
                            c.get({
                                path: fifoPath[endpoint] + res.location.replace(defaultFifoPath, ''),
                                headers: {
                                    'x-snarl-token': res.token
                                }
                            }, function(err, req, res, obj) {
                                if (err) {
                                    handleError(err, req, res)
                                    .then(function(data){
                                        deferredB.resolve(data);
                                    }, function(err){
                                        deferredB.reject(new Error(err));
                                    });
                                } else {
                                    saved_token[user] = {
                                        token: res.headers['x-snarl-token'],
                                        user: obj,
                                        endpoint: endpoint
                                    };
                                    saved_username = user;
                                    saved_password = password;
                                    deferredB.resolve(saved_token[user]);
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
    logout: function ()
    {
        delete saved_token[saved_username];
        saved_username = null;
        saved_password = null;
    },
    session_test: function(sessionid, token) {
        return get("/sessions/"+sessionid, token);
    },
    cloud_status: function(endpoint) {
        return get(endpoint, '/cloud/connection');
    }
};

var dcStruct = {
      list: [],
      ldata: {}
    };

for(var i=0; i<Config.FiFo.length; i++) {
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
    list_perms: function(id, token) {
        return get("/users/" + id + "/permissions", token);
    },
    grant: function(id, permission, token) {
        return put("/users/" + id + "/permissions/" + permission.join("/"), {}, token);
    },
    revoke: function(id, permission, token) {
        return del("/users/" + id + "/permissions/" + permission.join("/"), token);
    },
    list_groups: function(id, token) {
        return get("/users/" + id + "/groups", token);
    },
    join_group: function(id, group, token) {
        return put("/users/" + id + "/groups/" + group, {}, token);
    },
    leave_group: function(id, group, token) {
        return del("/users/" + id + "/groups/" + group, token);
    },
    list_orgs: function(id, token) {
        return get("/users/" + id + "/orgs", token);
    },
    join_org: function(id, org, token) {
        return put("/users/" + id + "/orgs/" + org, {}, token);
    },
    active_org: function(id, org, token) {
        return put("/users/" + id + "/orgs/" + org, {
            "active": true
        }, token);
    },
    leave_org: function(id, org, token) {
        return del("/users/" + id + "/orgs/" + org, token);
    },
    list_keys: function(id, token) {
        return get("/users/" + id + "/keys", token);
    },
    add_key: function(id, keyid, key, token) {
        var o = {};
        o[keyid] = key;
        return put("/users/" + id + "/keys", o, token);
    },
    delete_key: function(id, keyid, token) {
        return del("/users/" + id + "/keys/" + keyid, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("users", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("users", id, path, token);
    }
};

Group = {
    list: function(token) {
        return get("/groups", token);
    },
    listAll: function(token) {
        return getFull("/groups", token);
    },
    create: function(name, token) {
        return post("/groups", {
            "name": name
        }, token);
    },
    get: function(id, token) {
        return get("/groups/" + id, token);
    },
    del: function(id, token) {
        return del("/groups/" + id, token);
    },
    list_perms: function(id, token) {
        return get("/groups/" + id + "/permissions", token);
    },
    grant: function(id, permission, token) {
        return put("/groups/" + id + "/permissions/" + permission.join("/"), {}, token);
    },
    revoke: function(id, permission, token) {
        return del("/groups/" + id + "/permissions/" + permission.join("/"), token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("groups", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("groups", id, path, token);
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
    list_triggers: function(id, token) {
        return get("/orgs/" + id + "/triggers", token);
    },
    add_trigger: function(id, trigger_group, trigger_payload, token) {
        return put("/orgs/" + id + "/triggers/" + trigger_group, trigger_payload, token);
    },
    remove_trigger: function(id, trigger_group, trigger_payload, token) {
        console.error("Not working properly yet");
        // throw Error("Not supported");
        return del("/orgs/" + id + "/triggers/" + trigger_group, trigger_payload, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("orgs", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("orgs", id, path, token);
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
        return put("/hypervisors/" + id + "/config", {"alias": alias}, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("hypervisors", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("hypervisors", id, path, token);
    },
    characteristic_set: function(id, key, value, token) {
        var path = "/hypervisors/" + id + "/characteristics";
        var o = {};
        o[key] = value;
        return put(path, o, token);
    },
    characteristic_del: function(id, key, token) {
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
        return put("/vms/" + id, {"action": action}, token);
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
    force_action: function(id, action, token) {
        return put("/vms/" + id, {
            "action": action,
            "force": true
        }, token);
    },
    force_stop: function(id, token) {
        return VM.force_action(id, "stop", token);
    },
    force_reboot: function(id, token) {
        return VM.force_action(id, "reboot", token);
    },
    del: function(id, token) {
        return del("/vms/" + id, token);
    },
    nic_add: function(vm, mac, token) {
        return post("/vms/" + vm + "/nics", {"network": mac}, token);
    },
    nic_make_primary: function(vm, mac, token) {
        return put("/vms/" + vm + "/nics/" + mac, {"primary": true}, token);
    },
    nic_del: function(vm, mac, token) {
        return del("/vms/" + vm + "/nics/" + mac, token);
    },
    snapshots_list: function(vm, token) {
        return get("/vms/" + vm + "/snapshots", token);
    },
    snapshots_create: function(vm, comment, token) {
        return post("/vms/" + vm + "/snapshots", {"comment": comment}, token);
    },
    snapshots_get: function(vm, snap, token) {
        return get("/vms/" + vm + "/snapshots/" + snap, token);
    },
    snapshots_rollback: function(vm, snap, token) {
        return put("/vms/" + vm + "/snapshots/" + snap, {"action": "rollback"}, token);
    },
    snapshots_del: function(vm, snap, token) {
        return del("/vms/" + vm + "/snapshots/" + snap, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("vms", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("vms", id, path, token);
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
    add_iprange: function(net, iprange, token) {
        return put("/networks/" + net + "/ipranges/" + iprange, {}, token);
    },
    delete_iprange: function(net, iprange, token) {
        return del("/networks/" + net + "/ipranges/" + iprange, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("networks", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("networks", id, path, token);
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
    obtain_ip: function(id, token) {
        console.error("Not implemented in project-fifo yet. **Postponed**");
        return post("/ipranges/" + id, {}, token);
    },
    release_ip: function(id, ip, token) {
        console.error("Not implemented in project-fifo yet. **Postponed**");
        return del("/ipranges/" + id + "/" + ip, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("ipranges", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("ipranges", id, path, token);
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
    metadata_set: function(id, key, value, token) {
        return metadata_set("datasets", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("datasets", id, path, token);
    }
};

Package = {
    list: function(token) {
        return get("/packages", token);
    },
    listAll: function(token) {
        return getFull("/packages", token);
    },
    create: function(name, ram, quota, cpu_cap, requirements, token) {
        return post("/packages", {
            "name": name,
            "ram": ram,
            "quota": quota,
            "cpu_cap": cpu_cap,
            "requirements": requirements
        }, token);
    },
    get: function(id, token) {
        return get("/packages/" + id, token);
    },
    del: function(id, token) {
        return del("/packages/" + id, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("packages", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("packages", id, path, token);
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
    create_put: function(id, name, script, config, token) {
        console.error("Not implemented in project-fifo yet.");
        return put("/dtrace/" + id, {
            "name": name,
            "script": script,
            "config": config
        }, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("dtrace", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return metadata_del("dtrace", id, path, token);
    }
};
