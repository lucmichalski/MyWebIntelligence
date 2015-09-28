"use strict";

var sql = require('sql');
sql.setDialect('postgres');

var databaseP = require('./databaseClientP');

var massageExpressionDomain = require('./massageExpressionDomain');

var databaseJustCreatedSymbol = require('./databaseJustCreatedSymbol');
var justCreatedMarker = {};
justCreatedMarker[databaseJustCreatedSymbol] = true;

var expression_domains = require('./declarations.js').expression_domains;



module.exports = {

    create: function(edData){
        if(!Array.isArray(edData))
            edData = [edData];
        
        return databaseP.then(function(db){
            var query = expression_domains
                .insert(edData)
                .returning('*')
                .toQuery();

            //console.log('ResourceAnnotations create query', query);
            
            return new Promise(function(resolve, reject){
                db.query(query, function(err, result){
                    if(err) reject(Object.assign(err, {query: query}));
                    else resolve( result.rows.map(function(r){
                        return Object.assign( massageExpressionDomain(r), justCreatedMarker );
                    }) );
                });
            });
        })
    },
    
    findByName: function(name){
        return databaseP.then(function(db){
            var query = expression_domains
                .select('*')
                .where( expression_domains.name.equals(name) )
                .toQuery();

            //console.log('ResourceAnnotations findById query', query);
            
            return new Promise(function(resolve, reject){
                db.query(query, function(err, result){
                    if(err) reject(err); else resolve(massageExpressionDomain(result.rows[0]));
                });
            });
        })
    },
    
    update: function(id, expressionDomainsDelta){
        return databaseP.then(function(db){
            var query = expression_domains
                .update(expressionDomainsDelta)
                .where(expression_domains.id.equal(id))
                .toQuery();

            //console.log('ResourceAnnotations findById query', query);
            
            return new Promise(function(resolve, reject){
                db.query(query, function(err, result){
                    if(err) reject(err); else resolve(result);
                });
            });
        })
    }
    
};
