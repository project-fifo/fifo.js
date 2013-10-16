var sys = require('util');
var Q = require('q');
var restify = require('restify');

var version = '0.1.0';

function client(endpoint) {
    return restify.createJsonClient({
        rejectUnauthorized: false,
        url: endpoint
    });
}

function get(path, token) {
    var deferred = Q.defer();
    client(token.endpoint).get({
        path: "/api/0.1.0" + path,
        headers: {
            'x-snarl-token': token.token
        }
    }, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req._headers, res.headers);
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
}

function del(path, token) {
    var deferred = Q.defer();
    client(token.endpoint).del({
        path: "/api/0.1.0" + path,
        headers: {
            'x-snarl-token': token.token
        }
    }, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req._headers, res.headers);
            deferred.reject(new Error(err));
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
        path: "/api/0.1.0" + path,
        headers: {
            'x-snarl-token': token.token
        }
    }, body, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req._headers, res.headers);
            deferred.reject(new Error(err));
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
                console.log("error:", err, req._headers, res.headers);
                deferred2.reject(new Error(err));
            } else {
                deferred2.resolve(obj);
            }
        });
    });
    return deferred2.promise;
}

function put(path, body, token) {
    var deferred = Q.defer();
    client(token.endpoint).put({
        path: "/api/0.1.0" + path,
        headers: {
            'x-snarl-token': token.token
        }
    }, body, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req._headers, res.headers);
            deferred.reject(new Error(err));
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

FiFo = {
    connect: function(endpoint, user, password) {
        var deferred = Q.defer();
        var deferred2 = Q.defer();
        var c = client(endpoint);
        c.post("/api/0.1.0/sessions", {
            user: user,
            password: password
        }, function(err, req, res, obj) {
            if (err) {
                console.log("error:", err, req._headers, res.headers);
                deferred.reject(new Error(err));
            } else {
                deferred.resolve({
                    location: res.headers['location'],
                    token: res.headers['x-snarl-token']
                });
            }
        });
        deferred.promise.then(function(res) {
            c.get({
                path: res.location,
                headers: {
                    'x-snarl-token': res.token
                }
            }, function(err, req, res, obj) {
                if (err) {
                    console.log("error:", err, req._headers, res.headers);
                    deferred2.reject(new Error(err));
                } else {
                    deferred2.resolve({
                        token: res.headers['x-snarl-token'],
                        user: obj,
                        endpoint: endpoint
                    });
                }
            });
        });
        return deferred2.promise;
    },
    session_test: function(sessionid, token) {
        return get("/sessions/"+sessionid, token);
    },
    cloud_status: function(endpoint) {
        return get(endpoint, '/cloud/connection');
    }
};

User = {
    list: function(token) {
        return get("/users", token);
    },
    get: function(id, token) {
        return get("/users/" + id, token);
    },
    del: function(id, token) {
        return del("/users/" + id, token);
    },
    create: function(user, password, token) {
        return post("/users", {
            user: user,
            password: password
        }, token);
    },
    passwd: function(id, password, token) {
        return put("/users/" + id, {
            password: password
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
            active: true
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
        return del("/users/" + id + "/metadata/" + path, token);
    }
};

Group = {
    list: function(token) {
        return get("/groups", token);
    },
    get: function(id, token) {
        return get("/groups/" + id, token);
    },
    del: function(id, token) {
        return del("/groups/" + id, token);
    },
    create: function(name, token) {
        return post("/groups", {
            name: name
        }, token);
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
        return del("/groups/" + id + "/metadata/" + path, token);
    }
};

Organization = {
    list: function(token) {
        return get("/orgs", token);
    },
    get: function(id, token) {
        return get("/orgs/" + id, token);
    },
    del: function(id, token) {
        return del("/orgs/" + id, token);
    },
    create: function(name, token) {
        return post("/orgs", {
            name: name
        }, token);
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
        return del("/orgs/" + id + "/metadata/" + path, token);
    }
};

VMS = {
    list: function(token) {
        return get("/vms", token);
    },
    get: function(id, token) {
        return get("/vms/" + id, token);
    },
    action: function(id, action, token) {
        return put("/vms/" + id, {action: action}, token);
    },
    start: function(id, token) {
        return VMS.action(id, "start", token);
    },
    stop: function(id, token) {
        return VMS.action(id, "stop", token);
    },
    reboot: function(id, token) {
        return VMS.action(id, "reboot", token);
    },
    force_stop: function(id, token) {
        return put("/vms/" + id, {
            action: "stop",
            force: true
        }, token);
    },
    force_reboot: function(id, token) {
        return put("/vms/" + id, {
            action: "reboot",
            force: true
        }, token);
    },
    del: function(id, token) {
        return del("/vms/" + id, token);
    },
    nic_add: function(vm, network, token) {
        return put("/vms/" + vm + "/nics", {network:network}, token);
    },
    nic_make_primary: function(vm, mac, token) {
        return put("/vms/" + vm + "/nics/" + mac, {primary:true}, token);
    },
    nic_del: function(vm, mac, token) {
        return del("/vms/" + vm + "/nics/" + mac, token);
    },
    snapshots_list: function(vm, token) {
        return get("/vms/" + vm + "/snapshots", token);
    },
    snapshots_create: function(vm, comment, token) {
        return post("/vms/" + vm + "/snapshots", {comment: comment}, token);
    },
    snapshots_get: function(vm, snap, token) {
        return get("/vms/" + vm + "/snapshots/" + snap, token);
    },
    snapshots_rollback: function(vm, snap, token) {
        return put("/vms/" + vm + "/snapshots/" + snap, {action:rollback}, token);
    },
    snapshots_del: function(vm, snap, token) {
        return del("/vms/" + vm + "/snapshots/" + snap, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("vms", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return del("/vms/" + id + "/metadata/" + path, token);
    }
};

Networks = {
    list: function(token) {
        return get("/networks", token);
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
    del_iprange: function(net, iprange, token) {
        return del("/networks/" + net + "/ipranges/" + iprange, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("networks", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return del("/networks/" + id + "/metadata/" + path, token);
    }
};

Datasets = {
    list: function(token) {
        return get("/datasets", token);
    },
    get: function(id, token) {
        return get("/datasets/" + id, token);
    },
    del: function(id, token) {
        return del("/datasets/" + id, token);
    },
    set: function(where, id, key, value, token) {
        var o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/" + where + "/" + id;
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/" + where + "/" + id + "/" + path.join("/");
        }

        return put(path, o, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("datasets", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return del("/datasets/" + id + "/metadata/" + path, token);
    }
};

Packages = {
    list: function(token) {
        return get("/packages", token);
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
        return del("/packages/" + id + "/metadata/" + path, token);
    }
};

Dtrace = {
    list: function(token) {
        return get("/dtrace", token);
    },
    get: function(id, token) {
        return get("/dtrace/" + id, token);
    },
    del: function(id, token) {
        return del("/dtrace/" + id, token);
    },
    metadata_set: function(id, key, value, token) {
        return metadata_set("dtrace", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return del("/dtrace/" + id + "/metadata/" + path, token);
    }
};
