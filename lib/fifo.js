var sys = require('util');
var Q = require('q');
var restify = require('restify');

/*
  delete require.cache[require.resolve('./fifo.js')]

  require('./fifo.js')

  require('./lib/fifo.js')
  fifo = new FiFo("https://10.20.1.101", "test", "test")
  user = new User(fifo)
  group = new Group(fifo)
  org = new Organization(fifo)


  user.list().then(console.log)
  group.list().then(console.log)
  org.list().then(console.log)

  FiFo.connect("http://127.0.0.1", "admin", "admin")
  .then(partial(User.list, "http://127.0.0.1"))
  user.metadata_del('40896888-9738-4b83-9615-42c0c33da79a', "metadata/key")

  user.metadata_set('40896888-9738-4b83-9615-42c0c33da79a', "key", 1)

  fifo.cloud_connection()
*/

function client(endpoint) {
    return restify.createJsonClient({
        rejectUnauthorized: false,
        url: endpoint
    })
}

function get(endpoint, path, token) {
    var deferred = Q.defer();
    client(endpoint).get({
        path: "/api/0.1.0" + path,
        headers: {'x-snarl-token': token}
    }, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req, res)
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
};

function del(endpoint, path, token) {
    var deferred = Q.defer();
    client(endpoint).del({
        path: "/api/0.1.0" + path,
        headers: {'x-snarl-token': token}
    }, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req, res)
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
};

function post(endpoint, path, body, token) {
    var deferred = Q.defer();
    client(endpoint).post({
        path: "/api/0.1.0" + path,
        headers: {'x-snarl-token': token}
    }, body, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req, res)
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
};

function put(endpoint, path, body, token) {
    var deferred = Q.defer();
    client(endpoint).put({
        path: "/api/0.1.0" + path,
        headers: {'x-snarl-token': token}
    }, body, function(err, req, res, obj) {
        if (err) {
            console.log("error:", err, req, res)
            deferred.reject(new Error(err));
        } else {
            deferred.resolve(obj);
        }
    });
    return deferred.promise;
};

FiFo = {
    connect: function(endpoint, user, password) {
        var deferred = Q.defer();
        client(endpoint).post("/api/0.1.0/sessions", {
            user: user,
            password: password
        }, function(err, req, res, obj) {
            if (err) {
                console.log("error:", err, req, res);
                deferred.reject(new Error(err));
            } else {
                deferred.resolve(res.headers['x-snarl-token']);
            }
        });
        return deferred.promise;
    },
    cloud_status: function(endpoint) {
        return get(endpoint, '/cloud/connection');
    }
};

User = {
    list: function(endpoint, token) {
        return get(endpoint, "/users", token);
    },
    get: function(id, token) {
        return get(endpoint, "/users/"+id, token);
    },
    del: function(id, token) {
        return del(endpoint, "/users/"+id, token);
    },
    create: function(user, password, token) {
        return post(endpoint, "/users", {
            user: user,
            password: password
        }, token);
    },
    passwd: function(id, password, token) {
        return put("/users/" + id, {password: password}, token);
    },
    grant: function(id, permission, token) {
        return put("/users/" + id +"/permissions/" + permission.join("/"), {}, token);
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
        return put("/users/" + id + "/orgs/" + org, {active:true}, token);
    },
    leave_org: function(id, org, token) {
        return delete("/users/" + id + "/orgs/" + org, token);
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
        o = {}
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

        return put(path, o, token)
    },
    metadata_del: function(id, path, token) {
        return del("/users/" + id + "/metadata/" + path, token)
    },
};

Group = function Group(fifo) {
    this.fifo = fifo;
};

Group.prototype = {
    _get: function(path) {
        return this.fifo.get("/groups" + path);
    },
    _del: function(path) {
        console.log("del", path);
        return this.fifo.del("/groups" + path);
    },
    _put: function(path, obj) {
        return this.fifo.put("/groups" + path, obj);
    },
    _post: function(path, obj) {
        return this.fifo.post("/groups", obj);
    },
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


Organization = function Organization(fifo) {
    this.fifo = fifo;
};

Organization.prototype = {
    _get: function(path) {
        return this.fifo.get("/orgs" + path);
    },
    _del: function(path) {
        console.log("del", path);
        return this.fifo.del("/orgs" + path);
    },
    _put: function(path, obj) {
        return this.fifo.put("/orgs" + path, obj);
    },
    _post: function(path, obj) {
        return this.fifo.post("/orgs", obj);
    },
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
    add_trigger: function(id, trigger) {
        return this._put("/" + id + "/triggers", trigger);
    },
    remove_trigger: function(id, trigger) {
        console.error("Not working propperly yet");
        // throw Error("Not supported");
        return this._delete("/" + id + "/triggers/" + trigger);
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
