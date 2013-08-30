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
            console.log("error:", err, req, res);
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
            console.log("error:", err, req, res);
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
            console.log("error:", err, req, res);
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
                console.log("error:", err, req, res);
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
            console.log("error:", err, req, res);
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
}


function metadata_set(what, key, value, token) {
    var o = {};
    var path;
    if (typeof(key) == "string") {
        o[key] = value;
        path = "/" + what + "/" + id + "/metadata";
    } else {
        path = key;
        key = path.pop();
        o[key] = value;
        path = "/" + what + "/" + id + "/metadata/" + path.join("/");
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
                console.log("error:", err, req, res);
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
                    console.log("error:", err, req, res);
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
    grant: function(id, permission, token) {
        return put("/users/" + id + "/permissions/" + permission.join("/"), {}, token);
    },
    revoke: function(id, permission, token) {
        return del("/users/" + id + "/permissions/" + permission.join("/"), token);
    },
    join_group: function(id, group, token) {
        return put("/users/" + id + "/groups/" + group, {}, token);
    },
    leave_group: function(id, group, token) {
        return del("/users/" + id + "/groups/" + group, token);
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
    list: function() {
        return this._get("");
    },
    get: function(id) {
        return this._get("/" + id);
    },
    del: function(id) {
        return this._del("/" + id);
    },
    create: function(name) {
        return this._post(path, {
            name: user
        });
    },
    grant: function(id, permission) {
        return this._put("/" + id + "/permissions/" + permission.join("/"), {});
    },
    revoke: function(id, permission) {
        return this._delete("/" + id + "/permissions/" + permission.join("/"));
    },
    metadata_set: function(id, key, value) {
        return metadata_set("groups", id, key, value, token);
    },
    metadata_del: function(id, path) {
        return this._del("/" + id + "/metadata/" + path);
    }
};

Organization = {
    list: function() {
        return this._get("");
    },
    get: function(id) {
        return this._get("/" + id);
    },
    del: function(id) {
        return this._del("/" + id);
    },
    create: function(name, token) {
        return post("/orgs", {
            name: name
        }, token);
    },
    add_trigger: function(id, trigger) {
        return this._put("/" + id + "/triggers", trigger);
    },
    remove_trigger: function(id, trigger) {
        console.error("Not working propperly yet");
        // throw Error("Not supported");
        return this._delete("/" + id + "/triggers/" + trigger);
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
    metadata_set: function(id, key, value, token) {
        return metadata_set("packages", id, key, value, token);
    },
    metadata_del: function(id, path, token) {
        return del("/packages/" + id + "/metadata/" + path, token);
    }
};
