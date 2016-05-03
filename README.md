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
            dc: 'dc_name_x',
            url: 'http://127.0.0.1/',
            username: 'xx',
            password: 'xx'
        },
        {
            version: '3',
            dc: 'dc_name_y',
            url: 'http://1.2.3.4/',
            token: 'xx'
        }]
    };

require('node-fifo');
```
...

```

// use with a username and password

var token = FiFo.connect(fifo_url, fifo_username, fifo_password);
token.then(function(obj) {
  var session = FiFo.sessionTest(obj.token, obj);
  session.then(function(sess) {
    console.log(sess);
  });
};

```

```

// use with an api key

var token = FiFo.connect(fifo_url, '', fifo_token);
token.then(function(obj) {
  var session = FiFo.sessionTest(obj.token, obj);
  session.then(function(sess) {
    console.log(sess);
  });
};

```
