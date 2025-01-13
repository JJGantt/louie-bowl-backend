const express = require('express');
const cors = require('cors'); 
const bodyParser = require('body-parser');
const pool = require('./db'); 
const multer = require('multer');
const AWS = require('aws-sdk');
const path = require('path');
require('dotenv').config(); 


const app = express();
const upload = multer(); 

const PORT = process.env.PORT || 3000;



const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  });

app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/api/register', async (req, res) => {
    const { name, teammate, email } = req.body;
  
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required!' });
    }
  
    try {
      const result = await pool.query(
        'INSERT INTO registrations (name, teammate, email) VALUES ($1, $2, $3) RETURNING *',
        [name, teammate, email]
      );
  
      res.status(201).json({
        success: true,
        message: 'Registration saved successfully!',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error saving registration:', error);
  
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'Email already registered!' });
      }
  
      res.status(500).json({ success: false, message: 'Database error. Please try again.' });
    }
});

app.post('/api/submit-art', upload.single('file'), async (req, res) => {
    const { artistName, title, description } = req.body;
    const file = req.file;
  
    if (!artistName || !title || !file) {
      return res.status(400).json({ error: 'Artist name, title, and file are required.' });
    }
  
    try {
      const s3Params = {
        Bucket: 'art-contest-images', 
        Key: `${Date.now()}-${file.originalname}`, 
        Body: file.buffer,
        ContentType: file.mimetype,
      };
  
      const uploadResult = await s3.upload(s3Params).promise();
  
      const query = `
        INSERT INTO submissions (artist_name, artwork_title, description, file_path)
        VALUES ($1, $2, $3, $4) RETURNING *;
      `;
      const values = [artistName, title, description || null, uploadResult.Location];
  
      const result = await pool.query(query, values);
  
      res.status(201).json({
        message: 'Submission successful!',
        submission: result.rows[0],
      });
    } catch (error) {
      console.error('Error processing submission:', error);
      res.status(500).json({ error: 'An error occurred while processing the submission.' });
    }
});

app.get('/api/artworks', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, artist_name, artwork_title, description, file_path FROM submissions WHERE approved = true'
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching artworks:', error);
      res.status(500).json({ error: 'Error fetching artworks' });
    }
});

app.post('/api/vote', async (req, res) => {
    const { artId } = req.body;
  
    if (!artId) {
      return res.status(400).json({ error: 'Artwork ID is required to vote.' });
    }
  
    try {
      const query = `
        UPDATE submissions
        SET vote_count = COALESCE(vote_count, 0) + 1
        WHERE id = $1
        RETURNING *;
      `;
      const result = await pool.query(query, [artId]);
  
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Artwork not found.' });
      }
  
      res.status(200).json({ message: 'Vote recorded successfully!', artwork: result.rows[0] });
    } catch (error) {
      console.error('Error processing vote:', error);
      res.status(500).json({ error: 'An error occurred while recording the vote.' });
    }
  });
  
  

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
