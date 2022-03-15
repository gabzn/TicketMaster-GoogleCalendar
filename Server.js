const http = require("http");
const https = require("https");
const fs = require("fs");
const queryString = require("querystring");

const evenSearchEndpoint = "https://app.ticketmaster.com/discovery/v2/events";
const authEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const redirectURL = "http://localhost:3000/authorized/";
const scope = "https://www.googleapis.com/auth/calendar";
const accessTokenEndpoint = "https://oauth2.googleapis.com/token";
const calendarEndpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const {ticketmasterApiKey, clientID, clientSecret, googleApikey} =  require("./Auth/Auth.json");
const { doesNotMatch } = require("assert/strict");
let eventInfo = {};

const server = http.createServer();
server.on("request", requestHandler);
function requestHandler(req, res) 
{
    if(req.url === "/")
    {
        console.log("Viewing the root of the site. \n");
        fs.createReadStream("./HTML/Form.html").pipe(res);
    }
    else if(req.url.startsWith("/search"))
    {
        const inputURL = new URL(req.url, "http://localhost");
        const keyword = inputURL.searchParams.get("Event")

        getEventInfo(keyword, res);
    }
    else if(req.url.startsWith("/authorized"))
    {
        const authorizedURL = new URL(req.url, "http://localhost");
        const authorizationCode = authorizedURL.searchParams.get("code");
        console.log(authorizationCode);
        
        getAccessToken(authorizationCode, res);
    }
    else
    {
        res.writeHead(200, "Not Found", {"Content-Type": "text/html"});
        fs.createReadStream("./HTML/404Page.html").pipe(res);
    }
}

function getEventInfo(keyword, res)
{
    let queryParameters = queryString.stringify( {keyword : keyword, includeSpellcheck : "yes", apikey : ticketmasterApiKey, countryCode : "US"} );
    let eventStream = https.get(`${evenSearchEndpoint}?${queryParameters}`);

    eventStream.on("response", responseHandler);
    function responseHandler(responseStream)  // First way to convert a stream to string
    {
        let chunks = [];

        responseStream.on("data", chunk => chunks.push(chunk));
        responseStream.on("end", ()=>
        {
            let body = JSON.parse(Buffer.concat(chunks).toString());
            let detail = body?._embedded?.events[0];
 
            if(detail)
            {
                let name = detail.name;
                let startDate = detail.dates.start.localDate;
                let endDate = detail.dates.end.localDate;

                eventInfo = {name, startDate, endDate};
                console.log(eventInfo);
                
                getAuthorizationCode(res);
            }
            else    fs.createReadStream("./HTML/wrongInput.html").pipe(res);
        })
    }

    // Second way to convert a stream to string
    // function responseHandler(responseStream)
    // {
    //     let body = "";  

    //     responseStream.on("data", chunk => body += chunk);
    //     responseStream.on("end", () => 
    //     {
    //         let bodyObject = JSON.parse(body);    
    //     })
    // }
}

function getAuthorizationCode(res)
{
    let parameters = {client_id : clientID, response_type : "code", redirect_uri : redirectURL, scope : scope};
    let query = queryString.stringify(parameters);

    res.writeHead(302, {Location : `${authEndpoint}?${query}`})
       .end();
}

function getAccessToken(authorizationCode, res)
{
    let form = 
    {
        code : authorizationCode,
        client_id : clientID,
        client_secret : clientSecret,
        redirect_uri : redirectURL,
        grant_type : "authorization_code"
    };
    form = queryString.stringify(form);

    let options = 
    {
        method : "POST",
        headers :  {"Content-Type" : "application/x-www-form-urlencoded"}
    };

    https.request(accessTokenEndpoint, options, (accessTokenStream) => extraAccessToken(accessTokenStream, res))
         .end(form);
}

function extraAccessToken(accessTokenStream, res)
{
    let body = "";
    accessTokenStream.on("data", (chunk) => (body = body += chunk) );
    accessTokenStream.on("end", () => 
    {
        const tokenObject = JSON.parse(body);
        const accessToken = tokenObject.access_token;
        console.log(`\nThis is the access token : ${accessToken} \n`);
        
        insertEvent(accessToken, res);
    })
}

function insertEvent(accessToken, res)
{
    let options = 
    {
        method : "POST",
        headers : 
        {
            "Authorization" : `Bearer ${accessToken}`,
            "Content-Type" : "application/json"
        }
    }

    let key = queryString.stringify( {key : googleApikey} );
    let postData = 
    {
        "end" : { "date" : eventInfo.endDate },
        "start" : { "date" : eventInfo.startDate },
        "summary" : eventInfo.name
    };
    postData = JSON.stringify(postData);

    https.request(`${calendarEndpoint}?${key}`, options)
         .end(postData);

    res.end("Done");
}

server.on("listening", () => console.log("Listening on port 3000 now..."));
server.listen(3000);