# API to interact with a Fifo installation via node

## Installation:
```
npm install node-fifo
```

## Basic Usage:

```
var token = FiFo.connect(fifo_url, fifo_username, fifo_password);
token.then(function(obj) {
  var session = FiFo.sessionTest(obj.token, obj);
  session.then(function(sess) {
    console.log(sess);
  });
};

```
