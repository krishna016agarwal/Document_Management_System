const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
// const path = require('path'); // May not be needed if not serving static files
const apiRoutes = require('./routes/api');
const { connectDB } = require('./db'); // Import connectDB
require('dotenv').config();
const path=require("path")
const app = express();
const PORT = process.env.PORT || 3001;



const _dirname=path.resolve()

async function startServer() {
    await connectDB(); // Connect to MongoDB before starting the server

    // Middleware
   app.use(cors());
    app.use(morgan('dev'));
    app.use(express.json({ limit: '50mb' })); // Increase limit for potentially large document content
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // API Routes
    app.use('/api', apiRoutes);

    // No longer serving static files from a 'documents' folder for content
    // const documentsDir = path.join(__dirname, process.env.DATA_DIR || 'data', process.env.DOCUMENTS_SUBDIR || 'documents');
    // app.use('/api/files', express.static(documentsDir)); // REMOVE THIS OR REPURPOSE

    // Basic error handler
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(err.status || 500).send({ message: err.message || 'Something broke!', error: err.message });
    });
    
    app.use(express.static(path.join(_dirname,"/frontend/dist")))
app.use((req, res, next) => {
  // Serve the index.html file for all non-API requests
  if (!req.url.startsWith('/api')) { // Ensure API requests are not affected
    return res.sendFile(path.resolve(_dirname, 'frontend', 'dist', 'index.html'));
  }
  next(); // Proceed with other routes if it's an API request
});


    app.listen(PORT, () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
    });
}

startServer().catch(console.error);