"use strict";

require('../ES-mess');
//require('better-log').install();
process.title = "MyWI server";

var resolve = require('path').resolve;
var fs = require('fs');

var express = require('express');
var session = require('express-session');
var compression = require('compression');
var bodyParser = require('body-parser');
var multer = require('multer'); 

var csv = require('fast-csv');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var React = require('react');
var moment = require('moment');
var serializeDocumentToHTML = require('jsdom').serializeDocument;

var makeDocument = require('../common/makeDocument');
var database = require('../database');
var onQueryCreated = require('./onQueryCreated');
var createTerritoire = require('./createTerritoire');
var getTerritoireScreenData = require('../database/getTerritoireScreenData');
var simplifyExpression = require('./simplifyExpression');
var makeResourceSocialImpactIndexMap = require('../automatedAnnotation/makeResourceSocialImpactIndexMap');

var TerritoireListScreen = React.createFactory(require('../client/components/TerritoireListScreen'));
var NewTerritoireScreen = React.createFactory(require('../client/components/NewTerritoireScreen'));
var TerritoireViewScreen = React.createFactory(require('../client/components/TerritoireViewScreen'));

// start tasks processors
require('./init');
require('../crawl');
require('../automatedAnnotation');


var googleCredentials = require('../config/google-credentials.json');

// if(process.env.NODE_ENV !== "production") // commented for now. TODO Find proper way to handle both prod & dev envs
    //dropAllTables().then(createTables);

database.AlexaRankCache.count()
    .then(function(count){
        console.log('Number of Alexa Rank cache entries', count);
    })
    .catch(function(err){
        console.error('Error trying to get AlexaRank count', err, err.stack);
    })




// Doesn't make sense to start the server if this file doesn't exist. *Sync is fine.
var indexHTMLStr = fs.readFileSync(resolve(__dirname, '../client/index.html'), {encoding: 'utf8'});

var PORT = 3333;


var app = express();
app.disable("x-powered-by");

app.use(bodyParser.json({limit: "2mb"})); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data

var serializedUsers = new Map();

passport.use(new GoogleStrategy({
    clientID: googleCredentials["CLIENT_ID"],
    clientSecret: googleCredentials["CLIENT_SECRET"],
    callbackURL: googleCredentials["CALLBACK_URL"]
}, function(accessToken, refreshToken, profile, done){
    var googleUser = profile._json;

    function errFun(err){ done(err) }

    return database.Users.findByGoogleId(googleUser.id).then(function(user){
        if(user){
            console.log('User logging in', user.id, user.name);
            done(null, user);
        }
        else{
            console.log('no corresponding user for google id', googleUser.id);

            return database.Users.create({
                name: googleUser.name,
                emails: [googleUser.email],
                google_id: googleUser.id,
                google_name: googleUser.name,
                google_picture_url: googleUser.picture
            }).then(function(users){
                var u = users[0];
                console.log('created new user', u);
                done(null, u);
            });
        }
    }).catch(errFun)
}));

passport.serializeUser(function(user, done) {
    serializedUsers.set(user.id, user);
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    done(null, serializedUsers.get(id));
});



// gzip/deflate outgoing responses
app.use(session({ 
    secret: 'olive wood amplifi jourbon',
    key: "s",
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(resolve(__dirname, '..', 'client')));

app.use(compression());


/*
    Authentication routes
*/
app.get('/auth/google', passport.authenticate('google', {
    scope: ['https://www.googleapis.com/auth/userinfo.email']
}) );

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    function(req, res) {
    // Successful authentication, redirect home.
        res.redirect('/territoires');
    }
);


/***
    HTML routes
***/

function renderDocumentWithData(doc, data, reactFactory){
    doc.querySelector('body').innerHTML = React.renderToString( reactFactory(data) );
    doc.querySelector('script#init-data').textContent = JSON.stringify(data);
}

app.get('/territoires', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
    }
    else{
        var userInitDataP = database.complexQueries.getUserInitData(user.id);

        // Create a fresh document every time
        Promise.all([makeDocument(indexHTMLStr), userInitDataP]).then(function(result){
            var doc = result[0].document;
            var dispose = result[0].dispose;
            
            var initData = result[1];

            renderDocumentWithData(doc, initData, TerritoireListScreen);
            res.send( serializeDocumentToHTML(doc) );
            dispose();
        })
        .catch(function(err){ console.error('/territoires', err, err.stack); });
    }
});


app.get('/territoires/new', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
    }
    else{
        var userInitDataP = database.complexQueries.getUserInitData(user.id);

        // Create a fresh document every time
        Promise.all([makeDocument(indexHTMLStr), userInitDataP]).then(function(result){
            var doc = result[0].document;
            var dispose = result[0].dispose;
            
            var initData = result[1];

            renderDocumentWithData(doc, initData, NewTerritoireScreen);

            res.send( serializeDocumentToHTML(doc) );
            dispose();
        })
        .catch(function(err){ console.error('/territoires/new', err); });
    }
});


app.get('/territoire/:id', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var territoireId = req.params.id;
    
    if(!user || !user.id){
        res.redirect('/');
    }
    else{
        var userInitDataP = database.complexQueries.getUserInitData(user.id);
        var territoireP = database.Territoires.findById(territoireId);

        // Create a fresh document every time
        Promise.all([makeDocument(indexHTMLStr), userInitDataP, territoireP])
            .then(function(result){
                var doc = result[0].document;
                var dispose = result[0].dispose;

                var initData = result[1];
                var territoire = result[2];

                renderDocumentWithData(doc, Object.assign(initData, {
                    territoire: Object.assign({
                        queries: [],
                        graph: {
                            nodes: [],
                            edges: []
                        }
                    }, territoire)
                }), TerritoireViewScreen);

                res.send( serializeDocumentToHTML(doc) );
                dispose();
            })
            .catch(function(err){
                console.error('/territoire/:id problem', territoireId, err, err.stack);
                res.status(500).send(['/territoire/:id problem', territoireId, err].join(' '));
            });
    }

});




/***
    data/JSON routes
***/

app.put('/territoire', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var territoireData = req.body;
    console.log('creating territoire', user.id, territoireData);

    createTerritoire(territoireData, user).then(function(newTerritoire){
        res.status(201).send(newTerritoire);
    }).catch(function(err){
        res.status(500).send('database problem '+ err);
    });

});

app.post('/territoire/:id', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var id = req.params.id;
    var territoireData = req.body;
    territoireData.id = id; // preventive measure to force consistency between URL and body
    console.log('updating territoire', user.id, 'territoire', territoireData);

    database.Territoires.update(territoireData).then(function(newTerritoire){
        res.status(200).send(newTerritoire);
    }).catch(function(err){
        res.status(500).send('database problem '+ err);
    });

});

app.delete('/territoire/:id', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var id = req.params.id;
    console.log('deleting territoire', user.id, 'territoire id', id);

    database.Territoires.delete(id).then(function(){
        res.status(204).send('');
    }).catch(function(err){
        res.status(500).send('database problem '+ err);
    }); 
});


app.get('/territoire/:id/expressions.csv', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var territoireId = req.params.id;
    console.log('expressions.csv', user.id, 'territoire id', territoireId);
    
    var mainText = req.query.main_text === 'true';
    
    var territoireP = database.Territoires.findById(territoireId);

    var resourceAnnotationByResourceIdP = database.ResourceAnnotations.findApprovedByTerritoireId(territoireId)
        .then(function(annotations){
            var annotationByResourceId = Object.create(null);

            annotations.forEach(function(ann){                        
                annotationByResourceId[ann.resource_id] = Object.assign(
                    {},
                    ann,
                    {
                        territoire_id: undefined,
                        resource_id: undefined
                    }
                )
            });

            return annotationByResourceId;
        });

    var expressionDomainAnnotationByEDIdP = database.ExpressionDomainAnnotations.findByTerritoireId(territoireId)
        .then(function(annotations){
            var annotationByEDId = Object.create(null);
            
            annotations.forEach(function(ann){
                annotationByEDId[ann.expression_domain_id] = {
                    estimated_potential_audience: ann.estimated_potential_audience,
                    media_type: ann.media_type,
                    emitter_type: ann.emitter_type
                };
            });

            return annotationByEDId;
        });
    
    var territoireResourceIdsP = resourceAnnotationByResourceIdP.then(function(annotationByResourceId){
        return new Set(Object.keys(annotationByResourceId))
    })
    
    var expressionsWithResourceIdP = territoireResourceIdsP.then(function(ids){
        return database.complexQueries.getExpressionsByResourceIds(ids);
    });
    
    var expressionDomainsByIdP = database.complexQueries.getTerritoireExpressionDomains(territoireId)
        .then(function(expressionDomains){
            var o = Object.create(null);
            expressionDomains.forEach(function(ed){ o[ed.id] = ed; });
            return o;
        });
    
    
    Promise.all([
        territoireP, expressionsWithResourceIdP, resourceAnnotationByResourceIdP, expressionDomainsByIdP, expressionDomainAnnotationByEDIdP
    ]).then(function(result){
        var territoire = result[0];
        var expressionsWithResourceId = result[1];
        var resourceAnnotationByResourceId = result[2];
        var expressionDomainsById = result[3];
        var expressionDomainAnnotationByEDId = result[4];
        
        var socialImpactIndexMap = makeResourceSocialImpactIndexMap(resourceAnnotationByResourceId);
                
        var exportableResources = expressionsWithResourceId.map(function(expressionWithResourceId){
            var resourceId = expressionWithResourceId.resource_id;
            
            var expression = Object.freeze(expressionWithResourceId);
            var resourceAnnotations = resourceAnnotationByResourceId[resourceId];
            
            var expressionDomainId = resourceAnnotations.expression_domain_id;
            var expressionDomainAnnotations = expressionDomainAnnotationByEDId[expressionDomainId];
            
            if(expression){
                var simplifiedExpression = simplifyExpression(expression);
                
                // Reference : https://docs.google.com/spreadsheets/d/1y2-zKeWAD9POD_hjth-v4KlMlm5HqD7tzKvbPilLb4o/edit?usp=sharing
                
                var data = {
                    url: expressionWithResourceId.url,
                    title: expression.title,
                    excerpt: (simplifiedExpression.excerpt || '').trim(),
                    tags: (resourceAnnotations.tags || []).join(' / '),
                    favorite: resourceAnnotations.favorite,
                    sentiment: resourceAnnotations.sentiment,
                    publication_date: resourceAnnotations.publication_date ? 
                        moment(resourceAnnotations.publication_date).format('YYYY-MM-DD') : '',
                    content_length: (expression.main_text || '').length,
                    facebook_share: resourceAnnotations.facebook_share,
                    facebook_like: resourceAnnotations.facebook_like,
                    linkedin_share: resourceAnnotations.linkedin_share,
                    social_impact: socialImpactIndexMap.get(resourceId),
                    
                    // related to the domain
                    media_type: expressionDomainAnnotations.media_type, 
                    emitter_type: expressionDomainAnnotations.emitter_type, 
                    domain_title: (expressionDomainsById[expressionDomainId].title || '').trim()
                }
                
                if(mainText)
                    data.main_text = (expression.main_text || '').trim();
                
                return data;
            }
        }).filter(function(r){ return !!r; });
        
        var csvStream = csv.write(
            exportableResources,
            {headers: true}
        );
        
        // ready to send
        res.status(200);
        res.set('Content-Type', "text/csv");
        res.set('Content-disposition', 'attachment; filename="' + territoire.name.replace(/\"/g, '') + '-pages.csv"');
        
        csvStream.pipe(res);
    }).catch(function(err){
        console.error('expressions.csv error', err, err.stack)
        
        res.status(500).send('database problem '+ err);
    }); 
});



/*
    Export a territoire.
    The main goal here is to provide a one-click solution to extract all human-created information.
    Human time is precious. If people worked on something, they shouldn't have to do it again.
    This returns everything that was created by people for the purpose of being able to recreate a territoire later.
    Among other things, this also incidentally allows to export a territoire from one MyWI instance and import in another.    
*/
app.get('/territoire/export/:id', function(req, res){
    var territoireId = req.params.id;
    console.log('export territoire', territoireId);
    
    database.complexQueries.exportTerritoireHumanEffort(territoireId)
    .then(function(territoireExport){        
        res.status(200);
        res.set('Content-Type', "application/json");
        res.set('Content-disposition', 'attachment; filename="' + territoireExport.name.replace(/\"/g, '') + '-export.json"');
        
        res.send(JSON.stringify(territoireExport, null, 3));
    })
    .catch(function(err){
        console.error('export.json error', err, err.stack)
        
        res.status(500).send('database problem '+ err);
    }); 
    
})



// to create a query
app.post('/territoire/:id/query', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    // TODO  this should 403 if the user doesn't own the territoire or something
    
    var territoireId = req.params.id;
    var queryData = req.body;

    console.log('creating query', territoireId, queryData);
    queryData.territoire_id = territoireId;

    database.Queries.create(queryData).then(function(queries){
        var newQuery = queries[0];
        
        res.status(201).send(newQuery);
        onQueryCreated(newQuery, user);
    }).catch(function(err){
        res.status(500).send('database problem '+ err);
    });

});

// update query
app.post('/query/:id', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var id = req.params.id;
    var queryData = req.body;
    queryData.id = id; // preventive measure to force consistency between URL and body
    console.log('updating query', user.id, 'query', queryData);

    database.Queries.update(queryData).then(function(newQuery){
        res.status(200).send(newQuery);
    }).catch(function(err){
        res.status(500).send('database problem '+ err);
    });

});

app.delete('/query/:id', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    var id = req.params.id;
    console.log('deleting query', user.id, 'query id', id);

    database.Queries.delete(id).then(function(){
        res.status(204).send('');
    }).catch(function(err){
        res.status(500).send('database problem '+ err);
    }); 
});

app.post('/oracle-credentials', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
    }
    else{
        var oracleCredentialsBody = req.body;
        var oracleId = oracleCredentialsBody.oracle_id;
        delete oracleCredentialsBody.oracle_id;
        
        var oracleCredentialsData = {
            user_id: user.id,
            oracle_id: oracleId,
            credentials: JSON.stringify(oracleCredentialsBody)
        };
        
        console.log('updating oracle credentials', oracleCredentialsData);

        database.OracleCredentials.createOrUpdate(oracleCredentialsData).then(function(){
            res.status(200).send();
        }).catch(function(err){
            res.status(500).send('database problem '+ err);
        });
    }
});

app.get('/oracle-credentials', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
    }
    else{
        var userId = user.id;
        
        console.log('getting oracle credentials', userId);

        database.OracleCredentials.findByUserId(userId).then(function(oracleCredentials){
            res.status(200).send(oracleCredentials);
        }).catch(function(err){
            res.status(500).send('database problem '+ err);
        });
    }
});

app.get('/territoire-view-data/:id', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
        return;
    }
    
    var territoireId = req.params.id;
    
    getTerritoireScreenData(territoireId).then(function(territoireData){
        res.status(200).send(territoireData);
    }).catch(function(err){
        console.error('database problem', err, err.stack);
        res.status(500).send('database problem '+err);
    });
});

app.post('/resource-annotation/:territoireId/:resourceId', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
        return;
    }
    
    var territoireId = req.params.territoireId;
    var resourceId = req.params.resourceId;
    var delta = req.body;
    
    database.ResourceAnnotations.update(resourceId, territoireId, user.id, delta)
        .then(function(){
            res.status(200).send('');
        })
        .catch(function(err){
            console.error('database problem', err, err.stack);
            res.status(500).send('database problem '+err);
        });
});

app.post('/expression-domain-annotation/:territoireId/:edId', function(req, res){
    var user = serializedUsers.get(req.session.passport.user);
    if(!user || !user.id){
        res.redirect('/');
        return;
    }
    
    var territoireId = req.params.territoireId;
    var edId = req.params.edId;
    var delta = req.body;
    
    database.ExpressionDomainAnnotations.update(edId, territoireId, user.id, delta)
        .then(function(){
            res.status(200).send('');
        })
        .catch(function(err){
            console.error('database problem', err, err.stack);
            res.status(500).send('database problem '+err);
        });
});



var server = app.listen(PORT, function(){
    var host = server.address().address;
    var port = server.address().port;

    console.log('Listening at http://%s:%s', host, port);
});

process.on('uncaughtException', function(e){
    console.error('uncaughtException', e, e.stack);
});
