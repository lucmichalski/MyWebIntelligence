"use strict";

module.exports = function(keywords, options){
    // ignore the keywords
    return Promise.resolve(options.list);
};
