# MyWebIntelligence

The Open Source platform MyWebIntelligence ('MyWi' for short) produced by the MICA laboratory as part of the Institute of Digital Humanities provides a strategic tool to analyse and understand communication on the Internet. This is a "crawler" of a new generation which, from a keyword dictionary, builds a database of qualified web pages for the purpose of strategic intelligence.

My Web Intelligence can provide the means to capture, qualify and prioritize considerable discourse mass to map the universe of discourse on your interests. This will not only have real-time studies in the online discourse but also better understand the heterogeneous actors by their arguments and strategies.

A more **high-level description** can be found on [slideshare](http://www.slideshare.net/alakel/20140629-post1) 

## Architecture

For now, everything will belong in this repo. Eventually, parts will be separated into their own repos (perhaps some parts will even be released as NPM modules).

MyWI will be a project that can be installed on a server (dedicated machine) and accessed to via a web interface. MyWI needs crawling capabilities; as such, it needs to send HTTP requests all the time and throttle them (to be a good web citizen and not be blocked) as well as storage capabilities.


### User/Project management

* The database will a [PostgreSQL](http://www.postgresql.org/) database.
* [Express](http://expressjs.com/)


### Client-side

Client-side is built with 
* [React](http://facebook.github.io/react/) (without JSX)


### Tooling

* [Browserify](http://browserify.org/)
* [ESLint](http://eslint.org/)
* [Docker](https://www.docker.com/)


## As a developer

#### First time

* Install Node.js, Docker
* then:

```bash
npm install
```

* Build the docker image

```bash
npm run build-dev
```


#### Daily routine

```bash
npm run up-dev
npm run watch
```



## Installing on your own server

* **Install** [Docker](https://docs.docker.com/installation/#installation)
   * On Ubuntu, there is an [apt repository](https://docs.docker.com/engine/installation/ubuntulinux/)

````sh
git clone https://github.com/MyWebIntelligence/MyWebIntelligence.git
cd MyWebIntelligence
````

* **To get Google login**
    * Create a Google project in the [Google Console](https://console.developers.google.com)
    * Activate Google+ API for your project
    * Create OAuth2 credentials
    * `cp config/google-credentials.sample.json config/google-credentials.json`
    * Fill in credentials in `crawl/google-credentials.json`

* **(Optional) Create a [Readability account](https://www.readability.com/login/?next=/settings/account)**
    * [Create API keys](https://www.readability.com/settings/account) (need to verify email for that)
    * `cp crawl/config.sample.json crawl/config.json`
    * add your Parser API key token in the `"Readability-parser-API-key"` field

* **Build then run the production Docker image**

````sh
npm run build-stable
npm run up-stable
````

* **Initialize the database**

````sh
docker exec mywistable_app_1 node tools/recreateSQLTables.js
````

* **(Optional) Make a copy of Alexa's top 1M**

````sh
docker exec mywistable_app_1 node tools/cacheAlexaTop1M.js
````

## Licence

[MIT](LICENCE)
