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
        o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/users/" + id + "/metadata";
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/users/" + id + "/metadata/" + path.join("/");
        }

        return put(path, o, token);
    },
    metadata_del: function(id, path, token) {
        return del("/users/" + id + "/metadata/" + path, token);
    },
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
        o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/" + id + "/metadata";
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/" + id + "/metadata/" + path.join("/");
        }

        return this._put(path, o);
    },
    metadata_del: function(id, path) {
        return this._del("/" + id + "/metadata/" + path);
    },
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
        var o = {};
        var path;
        if (typeof(key) == "string") {
            o[key] = value;
            path = "/orgs/" + id + "/metadata";
        } else {
            path = key;
            key = path.pop();
            o[key] = value;
            path = "/orgs/" + id + "/metadata/" + path.join("/");
        }

        return put(path, o, token);
    },
    metadata_del: function(id, path, token) {
        return del("/orgs/" + id + "/metadata/" + path, token);
    }
};

VMS = {
    list: function(token) {
        return get("/vms", token);
    }

};
