const express = require('express');
const hbs = require('hbs');
const session = require('express-session');
const Store = require('express-sequelize-session')(session.Store);
const passport = require('passport');
const bodyParser = require('body-parser');
const compression = require('compression');
const csrf = require('csurf');
const fs = require('fs');
const helmet = require('helmet');
const ms = require('ms');
const morgan = require('morgan');
const flash = require('connect-flash');
const packageJson = require('./package.json');
const routes = require('./routes');
const config = require('./config');
const instance = require('./models').instance;
const Umzug = require('umzug');
const umzug = new Umzug({
    storage: "sequelize",
    storageOptions: {
        sequelize: instance,
    },
    migrations: {
        params: [
            instance.getQueryInterface(),
            instance.constructor,
            instance,
        ]
    }
});

passport.serializeUser(function(user, done) {
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    instance.model('User').findById(id).then(function(user) {
        done(null, user);
    }).catch(function(err) {
        done(err, false);
    });
});

hbs.registerPartials(__dirname + '/views/partials');

const app = express();
app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');
app.disable('x-powered-by');
app.enable('strict routing');
app.enable('case sensitive routing');

app.locals.origin = config.origin;
hbs.localsAsTemplateData(app);

require('./hbs_helpers.js')();

app.use(compression());
app.use(express.static(__dirname + '/dist'));
app.use(express.static(__dirname + '/assets/images'));
app.use(express.static(__dirname + '/webroot'));

// Logging
if(process.env.NODE_ENV === 'production') {
    const logDirectory = __dirname + '/log';
    if(! fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory);
    }
    const logStream = require('file-stream-rotator').getStream({
        date_format: 'YYYYMMDD',
        filename: logDirectory + '/access%DATE%.log',
        frequency: 'daily',
        verbose: false
    });
    app.use(morgan('combined', {stream: logStream}));
} else {
    app.use(morgan('dev'));
}

app.use(helmet.contentSecurityPolicy({
    directives: {
        baseUri: ["'self'"],
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        childSrc: ["https://www.google.com/recaptcha/"],
        frameAncestors: ["'none'"]
    },
    setAllHeaders: false,
    browserSniff: false
}));
app.use(helmet.frameguard({
    action: 'deny'
}));
app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(bodyParser.urlencoded({extended: false}));
app.use(session({
    name: 'sid',
    secret: config.sessionSecret,
    store: new Store(instance),
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: !!config.https
    }
}));
app.use(flash());
app.use(csrf());
app.use(passport.initialize());
app.use(passport.session());

routes(app);

umzug.up().then((migrations) => {
    if(migrations.length > 0) {
        console.log("Executed migrations: %s", migrations.map(x => x.file).join(" "));
    } else {
        console.log("Database was up to date!");
    }
    app.listen(config.httpPort, function() {
        console.log('Visit %s', config.origin);
    });
}).catch((err) => {
    console.log("Umzug failed!");
    console.log(err);
});
