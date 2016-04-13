# API to interact with a Fifo installation via node

## Installation:
```
npm install node-fifo
```

## Basic Usage:
```
var Config = global.Config = {
        FiFo: [{
            version: '3',
            dc: 'dc_name',
            url: 'http://127.0.0.1/',
            username: 'xx',
            password: 'xx'
        }]
    };

require('node-fifo');
```
...

```
var token = FiFo.connect(fifo_url, fifo_username, fifo_password);
token.then(function(obj) {
  var session = FiFo.sessionTest(obj.token, obj);
  session.then(function(sess) {
    console.log(sess);
  });
};

```
