const PORT = process.env.PORT || 8000
const {MongoClient} = require('mongodb')
const express = require('express')
const { v4 : uuidv4 } = require('uuid')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const bcrypt = require('bcrypt')
const SpotifyWebApi = require('spotify-web-api-node')

require('dotenv').config()

const uri = process.env.URI 
const client_id = process.env.CLIENT_ID
const client_secret = process.env.CLIENT_SECRET
const client_app_url = process.env.CLIENT_APP_URL
const redirect_uri = "https://rhythmate-backend.onrender.com"

const app = express()
app.use(cors())
app.use(express.json())


app.get('/', (req,res) => {
    res.json('Hello to my App')
})

app.listen(PORT, () => console.log('Server runnning on PORT ' + PORT))

app.post('/signup', async (req,res) => {
    const client = new MongoClient(uri)
    const {email, password} = req.body
    const generateUserId = uuidv4()
    const hashedPassowrd = await bcrypt.hash(password,10)

    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')
        
        const sanitizedEmail = email.toLowerCase()
        const existingUser = await users.findOne({email})
        
        if(existingUser){
            return res.status(409).send('User already exists. Please Login!')
        }

        const data = {
            user_id : generateUserId,
            email : sanitizedEmail,
            hashedPassowrd : hashedPassowrd,
        }
        const insertedUser = await users.insertOne(data)
        
        const token = jwt.sign(insertedUser, sanitizedEmail, {
            expiresIn : 60 * 1
        })

        res.status(201).json({ token, user_id: generateUserId})

    } catch(err) {
        console.log(err)
    }
})


app.post('/login', async (req,res) => {
    const client = new MongoClient(uri)
    const { email, password } = req.body

    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')
        const temp = email.toLowerCase()
        const user = await users.findOne({ email: temp })
        // console.log(user)

        if(user && (await bcrypt.compare(password, user.hashedPassowrd))){
            const token = jwt.sign(user, temp, {
                expiresIn : 60 * 1
            })
            res.status(201).json({ token, user_id: user.user_id})
            return
        }
        
        res.status(400).send('Invalid Credentials')
    } catch(err) {
        console.log(err)
    }
})

app.get('/gendered-users', async(req,res) => {
    const client = new MongoClient(uri)
    const gender = req.query.gender

    // console.log('gender', gender) 
    
    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')
        const query = { gender_identity: gender }
        const foundUsers = await users.find(query).toArray()
        res.send(foundUsers)
    } finally {
        await client.close()
    }

})

app.put('/users', async (req,res)=>{
    const client = new MongoClient(uri)
    const formData = req.body.formData 

    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')
        const user = await users.findOne({ user_id: formData.user_id })
        const query = { user_id: formData.user_id }
        const updateDocument = {
            $set: {
                first_name : formData.first_name,
                dob_day : formData.dob_day,
                dob_month : formData.dob_month,
                dob_year : formData.dob_year,
                show_gender : formData.show_gender,
                gender_identity : formData.gender_identity,
                gender_interest : formData.gender_interest,
                url : formData.url,
                about : formData.about,
                matches : formData.matches
            },
        }

        const insertedUser = await users.updateOne(query, updateDocument)
        res.send(insertedUser)

    } finally {
        await client.close()
    }

})
 

app.get('/user', async (req, res) => {
    const client = new MongoClient(uri)
    const userId = req.query.userId

    try {
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')

        const query = {user_id: userId}
        const user = await users.findOne(query)
        res.send(user)

    } finally {
        await client.close()
    }
})

app.put('/addmatch', async (req, res) => {
    const client = new MongoClient(uri)
    const {userId, matchedUserId} = req.body
    // console.log('**')
    try {
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')

        const query = {user_id: userId}
        const updateDocument = {
            $push: {matches: {user_id: matchedUserId}}
        }
        const user = await users.updateOne(query, updateDocument)
        res.send(user)
        // console.log(user)
    } finally {
        await client.close()
    }
})

app.get('/users', async (req, res) => {
    const client = new MongoClient(uri)
    const userIds = JSON.parse(req.query.userIds) 
    
    
    try {
        await client.connect()
        const database = client.db('RhythMatch')
        const users = database.collection('users')

        const pipeline = 
        [
            {
                '$match': {
                    user_id : {
                        '$in' : userIds
                    }
                }
            }
        ]

        const foundUsers = await users.aggregate(pipeline).toArray()
        // console.log(foundUsers)
        res.send(foundUsers)
    } finally {
        await client.close()
    }
}) 

app.get('/messages', async (req,res) => {
    const client = new MongoClient(uri)
    const { userId, correspondingUserId } = req.query
    
    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const messages = database.collection('messages')

        const query = {
            from_userId: userId,
            to_userId: correspondingUserId
        }
        const foundMessages = await messages.find(query).toArray()
        res.send(foundMessages)
    } finally {
        await client.close()
    }
})

app.post('/message', async (req, res) => {
    const client = new MongoClient(uri)
    const message = req.body.message

    try {
        await client.connect()
        const database = client.db('RhythMatch')
        const messages = database.collection('messages')

        const insertedMessage = await messages.insertOne(message)
        res.send(insertedMessage)
        // console.log(insertedMessage)
    } finally {
        await client.close()
    }
})

//------------------------------------------SPOTIFY------------------------------------------
  
const spotifyApi = new SpotifyWebApi({ 
    clientId: client_id,
    clientSecret: client_secret,
    redirectUri: redirect_uri
}) 

app.get('/authenticate', async (req,res) => {
    const scopes = ['user-read-private', 'user-read-email','user-top-read']
    res.redirect(spotifyApi.createAuthorizeURL(scopes)) 
    // console.log('check')
})

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    // console.log('Hi')
    try {
        const data = await spotifyApi.authorizationCodeGrant(code);
        const accessToken = data.body['access_token'];
        const refreshToken = data.body['refresh_token'];
        const expiresIn = data.body['expires_in'];

        spotifyApi.setAccessToken(accessToken);
        spotifyApi.setRefreshToken(refreshToken);

        console.log(accessToken, refreshToken);
        console.log('Success'); 

        const refreshInterval = setInterval(async () => {
            try {
                const refreshedData = await spotifyApi.refreshAccessToken();
                const refreshedAccessToken = refreshedData.body['access_token'];
                spotifyApi.setAccessToken(refreshedAccessToken);
                console.log('Access token refreshed successfully.');
            } catch (error) {
                console.error('Error refreshing access token:', error);
                clearInterval(refreshInterval); 
            }
        }, expiresIn / 4 * 1000);

        res.redirect(`${client_app_url}?access_token=${accessToken}`)

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error occurred');
    }
}) 

app.get('/artists', async(req, res) => {
    const accessToken = req.query.accessToken; 
    if (!accessToken) {
        return res.status(400).json({ error: 'Access token is missing' });
    }

    spotifyApi.setAccessToken(accessToken);
    try {
        const data = await spotifyApi.getMyTopArtists()
        let topArtists = data.body.items;
        // console.log('from spotify->', topArtists)
        res.json(topArtists); // 
    } catch (err) {
        console.log('Something went wrong!', err);
        res.status(500).json({ error: 'Kuch Gadbad ho gya re baba' });
    }
})

app.post('/top-artists', async (req,res) => {
    const client = new MongoClient(uri) 
    const { user_id, TopArtistList } = req.body;
    // console.log(user_id) 
    console.log('from DB->',TopArtistList)
    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const collection = database.collection('spotify_top_artists')
        const existingTracks = await collection.findOne({ user_id: user_id });
        // console.log('----->: ',user_id)
        // console.log('***', existingTracks)
        // console.log('topArtistList', TopArtistList)
        const data = {
            user_id : user_id,
            artist_name: TopArtistList.slice(0, 5).map(artist => artist.name),
            artist_images: TopArtistList.slice(0, 5).map(artist => artist.images[0]?.url),
            artist_urls: TopArtistList.slice(0, 5).map(artist => artist.external_urls.spotify)
        }
       
        // console.log('ExistingTracks: ', existingTracks)
        console.log('data: ', data)
        // console.log('checkinudnbuisnvuDShv->',data.artist_name.length===0)
        if(existingTracks){
            if(data.artist_name.length===0){
                console.log('1')
                res.send('Access Tokern Exipred')
            } 
            else await collection.updateOne({ user_id: user_id}, { $set: data });
        } else if(data.artist_name.length!==0){
            console.log('2')
            await collection.insertOne(data)
        } else {
            console.log('3')
            res.send('Unable to Connect to Mongo')
        }
        // console.log('1')
        res.status(201)

    } catch(err) {
        console.log(err)
    } 
}) 

app.get('/get-artists', async (req, res) => {
    const client = new MongoClient(uri)
    const user_id = req.query.user_id
    // console.log(user_id)
    try {
        await client.connect()
        const database = client.db('RhythMatch')
        const collection = database.collection('spotify_top_artists')

        const query = {user_id: user_id}
        const topTracks = await collection.findOne(query)
        res.send(topTracks)
        // console.log(topTracks) 
    } catch(err){
        console.log('Error-> ', err)
    } 
    finally {
        await client.close()
    }
})

app.get('/songs', async(req, res) => {
    const accessToken = req.query.accessToken; 
    if (!accessToken) {
        return res.status(400).json({ error: 'Access token is missing' });
    }
    spotifyApi.setAccessToken(accessToken);
    console.log('ggs')
    try {
        const data = await spotifyApi.getMyTopTracks()
        let topSongs = data.body.items;
        // console.log(topSongs)
        res.json(topSongs) 
    } catch (err) {
        console.log('Something went wrong!', err);
        res.status(500).json({ error: 'Kuch Gadbad ho gya re baba' });
    }
})

app.post('/top-songs', async (req,res) => {
    const client = new MongoClient(uri) 
    const { user_id, TopSongsList } = req.body;
    // console.log('user_id: ', user_id) 
    // console.log('topsongs: ', TopSongsList) 
    try{
        await client.connect()
        const database = client.db('RhythMatch')
        const collection = database.collection('spotify_top_tracks')
        const existingTracks = await collection.findOne({ user_id: user_id })
        // console.log('topArtistList', TopArtistList)
        const data = {
            user_id : user_id,
            tracks_name: TopSongsList.slice(0, 5).map(track => track.name),
            track_artists: TopSongsList.slice(0, 5).map(track => track.artists),
            track_urls: TopSongsList.slice(0, 5).map(track => track.external_urls.spotify),
            track_preview_url: TopSongsList.slice(0, 5).map(track => track.preview_url),
            track_img: TopSongsList.slice(0, 5).map(track => track.album.images),
        }
        // console.log('ExistingTracks: ', existingTracks)
        // console.log('data: ', data)
        if(existingTracks){
            if(!data.tracks_name.length) res.send('Access Tokern Exipred')
            else await collection.updateOne({ user_id: user_id}, { $set: data });
        } else{
            await collection.insertOne(data)
        }
        // console.log('1')
        res.status(201)

    } catch(err) { 
        console.log(err)
    } 
}) 

app.get('/get-songs', async (req, res) => {
    const client = new MongoClient(uri)
    const user_id = req.query.user_id
    console.log(user_id)
    try {
        await client.connect()
        const database = client.db('RhythMatch')
        const collection = database.collection('spotify_top_tracks')

        const query = {user_id: user_id}
        const topTracks = await collection.findOne(query)
        res.send(topTracks)
        // console.log(topTracks) 
    } catch(err){
        console.log('Error-> ', err)
    } 
    finally {
        await client.close()
    }
})