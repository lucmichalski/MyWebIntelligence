"use strict";

var database = require('../database');
var interogateOracle = require('../oracles/interogateOracle');
var cleanupURLs = require('../common/cleanupURLs');

module.exports = function onQueryCreated(query, user){
    console.log("onQueryCreated", query.name, query.territoire_id, user.name);
    
    return database.Oracles.findById(query.oracle_id)
        .then(function(oracle){
            var oracleOptions = query.oracle_options;
        
            if(oracle.credentials_infos){
                return database.OracleCredentials.findByUserAndOracleId(user.id, oracle.id).then(function(uoCreds){
                    var creds = uoCreds[0];
                    return interogateOracle(oracle, query.q, oracleOptions, creds.credentials);
                });
            }
            else{
                return interogateOracle(oracle, query.q, oracleOptions);
            }
        })
        .then(function(queryResults){
        
            var cleanQueryResults = new Set(cleanupURLs(queryResults.toJSON()));
        
            console.log('query.territoire_id', query.territoire_id)
        
            return Promise.all([
                database.QueryResults.create({
                    query_id: query.id,
                    results: queryResults.toJSON(), // store the exact results returned by the oracle
                    created_at: new Date()
                }),
                database.Resources.findByURLsOrCreate(cleanQueryResults)
                    .then(function(resources){
                        return Promise._allResolved(resources.map(function(r){
                            return database.Tasks.createTasksTodo(r.id, query.territoire_id, 'prepare_resource', 0);
                        }))
                    })
            ]);
        })
        .catch(function(err){
            console.error('onQueryCreated error', err, err.stack);
        });
};
