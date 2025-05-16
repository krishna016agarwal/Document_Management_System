const express = require('express');
const { getDB, ObjectId } = require('../db');
const multer = require('multer');
const { uploadFileToR2, deleteFileFromR2, R2_IS_CONFIGURED } = require('../r2'); // Adjust path if r2.js is elsewhere

const router = express.Router();

// Multer setup for file uploads
const storage = multer.memoryStorage(); // Store files in memory before uploading to R2
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Helper to build tree structure from flat list of items
function buildTree(items, parentId = null) {
    const tree = [];
    items.forEach(item => {
        const itemParentId = item.parentId ? String(item.parentId) : null;
        const targetParentId = parentId ? String(parentId) : null;

        if (itemParentId === targetParentId) {
            const children = buildTree(items, item._id);
            item.children = children.length > 0 ? children : [];
            tree.push(item);
        }
    });
    return tree.sort((a, b) => a.name.localeCompare(b.name));
}


// --- Structure Route (GET all items and build tree) ---
router.get('/structure', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const allItems = await itemsCollection.find({}).toArray();
        
        const itemsWithId = allItems.map(item => ({ ...item, id: item._id.toString() }));
        
        const treeStructure = buildTree(itemsWithId, null);
        res.json(treeStructure);
    } catch (error) {
        next(error);
    }
});

// --- Item (Category/Document) Routes ---

// Add item (category or document with optional file upload)
router.post('/items', upload.single('file'), async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        
        const isFormData = req.is('multipart/form-data');
        let parentId, itemDataInput;

        if (isFormData) {
            parentId = req.body.parentId || null; // parentId can be empty string for root
            itemDataInput = {
                name: req.body.name,
                type: req.body.type || 'document',
                tags: req.body.tags ? JSON.parse(req.body.tags) : [], // Assuming tags sent as JSON string
            };
        } else { // JSON request
            parentId = req.body.parentId;
            itemDataInput = req.body.itemData;
        }

        if (!itemDataInput || !itemDataInput.name || !itemDataInput.type) {
            return res.status(400).json({ message: 'Missing item data fields (name, type are required)' });
        }
        if (parentId === '') parentId = null; // Treat empty string parentId as null for root

        const newItem = {
            name: itemDataInput.name,
            type: itemDataInput.type,
            parentId: parentId ? new ObjectId(parentId) : null,
            tags: itemDataInput.tags || [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        if (itemDataInput.type === 'document') {
            if (req.file) { // File uploaded via FormData
                if (!R2_IS_CONFIGURED) {
                    return res.status(503).json({ message: "File upload service (R2) is not configured on the server." });
                }
                const r2File = await uploadFileToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
                newItem.storageType = 'r2';
                newItem.fileDetails = { // Store all relevant details from R2 upload
                    key: r2File.key,
                    url: r2File.url,
                    originalName: r2File.originalName,
                    mimeType: r2File.mimeType,
                    size: r2File.size,
                };
                newItem.content = r2File.url; // Main content is the URL for R2 files
                newItem.isMarkdownContent = false;
            } else if (!isFormData) { // JSON request for inline content (blank, .md, .html)
                newItem.content = itemDataInput.content || '';
                newItem.isMarkdownContent = !!itemDataInput.isMarkdownContent;
                newItem.storageType = 'inline';
            } else { // FormData but no file - treat as blank document (edge case)
                newItem.content = '<h1>New Document</h1><p>Start editing your content here.</p>';
                newItem.isMarkdownContent = false;
                newItem.storageType = 'inline';
            }
        }
        
        const result = await itemsCollection.insertOne(newItem);
        const savedItem = { ...newItem, _id: result.insertedId, id: result.insertedId.toString() };
        // Ensure fileDetails is properly structured for the response
        if (savedItem.fileDetails) {
             savedItem.fileDetails = { ...savedItem.fileDetails };
        }

        res.status(201).json(savedItem);
    } catch (error) {
        if (error.name === 'BSONTypeError' || (error.message && error.message.includes("Argument passed in must be a string of 12 bytes"))) {
            return res.status(400).json({ message: "Invalid parentId format." });
        }
        console.error("Error in POST /items:", error);
        next(error);
    }
});

// Rename item
router.put('/items/:id/rename', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const { id } = req.params;
        const { newName } = req.body;

        if (!newName || !newName.trim()) {
            return res.status(400).json({ message: 'New name is required' });
        }
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID format' });
        }

        const result = await itemsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { name: newName.trim(), updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Item not found' });
        }
        res.json({ message: 'Item renamed successfully', id, newName: newName.trim() });
    } catch (error) {
        next(error);
    }
});

// Update document content (Versioning Aware - for inline content)
router.put('/documents/:id/content', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const revisionsCollection = db.collection('documentRevisions');
        const { id } = req.params;
        const { content: newContent, isMarkdownContent: newIsMarkdownContent, tags } = req.body;

        if (newContent === undefined) {
            return res.status(400).json({ message: 'Content is required' });
        }
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid document ID format' });
        }

        const documentId = new ObjectId(id);
        const currentDocument = await itemsCollection.findOne({ _id: documentId, type: 'document' });

        if (!currentDocument) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Prevent updating content of R2 stored files via this endpoint
        if (currentDocument.storageType === 'r2') {
            return res.status(400).json({ message: 'Cannot update content of R2 stored files directly. Use replace file functionality (if available) or delete and re-upload.' });
        }

        if (currentDocument.content !== undefined) {
            const latestRevisionArray = await revisionsCollection.find({ documentId: documentId })
                                        .sort({ version: -1 }).limit(1).toArray();
            const nextVersion = latestRevisionArray.length > 0 ? latestRevisionArray[0].version + 1 : 1;

            const revision = {
                documentId: documentId,
                content: currentDocument.content,
                isMarkdownContent: currentDocument.isMarkdownContent || false,
                version: nextVersion,
                savedAt: currentDocument.updatedAt || currentDocument.createdAt || new Date(),
            };
            await revisionsCollection.insertOne(revision);
        }

        const updateFields = {
            content: newContent,
            isMarkdownContent: !!newIsMarkdownContent,
            updatedAt: new Date()
        };
        if (tags !== undefined && Array.isArray(tags)) {
            updateFields.tags = tags.map(tag => String(tag).trim()).filter(Boolean);
        }

        const result = await itemsCollection.updateOne({ _id: documentId }, { $set: updateFields });

        if (result.matchedCount === 0) {
            return res.status(500).json({ message: 'Document found but failed to update' });
        }
        res.json({ message: 'Document content updated and revision saved', id });
    } catch (error) {
        next(error);
    }
});

// Delete item and its children (if category), its revisions, and R2 files
router.delete('/items/:id', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const revisionsCollection = db.collection('documentRevisions');
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID format' });
        }

        const itemId = new ObjectId(id);
        const itemToDelete = await itemsCollection.findOne({ _id: itemId });

        if (!itemToDelete) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const r2FilesToDeleteKeys = [];
        if (itemToDelete.storageType === 'r2' && itemToDelete.fileDetails && itemToDelete.fileDetails.key) {
            r2FilesToDeleteKeys.push(itemToDelete.fileDetails.key);
        }

        const idsToDeleteFromDb = [itemId];

        if (itemToDelete.type === 'category') {
            const allItems = await itemsCollection.find({}).toArray(); // Consider optimizing for very large datasets
            
            function collectDescendants(parentIdStr) {
                const children = allItems.filter(item => item.parentId && String(item.parentId) === parentIdStr);
                children.forEach(child => {
                    idsToDeleteFromDb.push(child._id);
                    if (child.storageType === 'r2' && child.fileDetails && child.fileDetails.key) {
                        r2FilesToDeleteKeys.push(child.fileDetails.key);
                    }
                    if (child.type === 'category') {
                        collectDescendants(String(child._id));
                    }
                });
            }
            collectDescendants(String(itemId));
        }
        
        const objectIdsToDelete = idsToDeleteFromDb.map(idVal => idVal instanceof ObjectId ? idVal : new ObjectId(idVal));

        // Delete R2 files
        if (R2_IS_CONFIGURED && r2FilesToDeleteKeys.length > 0) {
            await Promise.all(r2FilesToDeleteKeys.map(key => deleteFileFromR2(key)));
        }

        // Delete from MongoDB
        const deleteItemsResult = await itemsCollection.deleteMany({ _id: { $in: objectIdsToDelete } });
        await revisionsCollection.deleteMany({ documentId: { $in: objectIdsToDelete } });

        res.json({ 
            message: `${deleteItemsResult.deletedCount} item(s) and associated data deleted successfully. ${r2FilesToDeleteKeys.length} R2 file(s) targeted for deletion.`, 
            id 
        });
    } catch (error) {
        console.error("Error in DELETE /items/:id:", error);
        next(error);
    }
});

// --- Item Position Update Route (for D&D) ---
router.put('/items/:id/position', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const { id } = req.params;
        const { newParentId } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID format' });
        }
        if (newParentId !== null && !ObjectId.isValid(newParentId)) {
            return res.status(400).json({ message: 'Invalid new parent ID format' });
        }

        const updates = {
            parentId: newParentId ? new ObjectId(newParentId) : null,
            updatedAt: new Date()
        };

        const result = await itemsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Item not found' });
        }
        res.json({ message: 'Item position updated successfully' });
    } catch (error) {
        next(error);
    }
});

// --- Document Revision Routes (for inline content) ---
router.get('/documents/:id/revisions', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const revisionsCollection = db.collection('documentRevisions');
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid document ID' });
        }
        const documentId = new ObjectId(id);

        // Check if document is inline or R2
        const doc = await itemsCollection.findOne({_id: documentId, type: 'document'});
        if(doc && doc.storageType === 'r2'){
             return res.json([]); // No text revisions for R2 files
        }


        const revisions = await revisionsCollection.find({ documentId: documentId })
                                .sort({ version: -1 })
                                .project({ content: 0 }) 
                                .toArray();
        const revisionsWithId = revisions.map(rev => ({ ...rev, id: rev._id.toString() }));
        res.json(revisionsWithId);
    } catch (error) {
        next(error);
    }
});

router.get('/revisions/:revisionId', async (req, res, next) => {
    try {
        const db = getDB();
        const revisionsCollection = db.collection('documentRevisions');
        const { revisionId } = req.params;

        if (!ObjectId.isValid(revisionId)) {
            return res.status(400).json({ message: 'Invalid revision ID format' });
        }
        const revObjectId = new ObjectId(revisionId);
        const revision = await revisionsCollection.findOne({ _id: revObjectId });
        if (!revision) {
            return res.status(404).json({ message: 'Revision not found' });
        }
        res.json({ ...revision, id: revision._id.toString() });
    } catch (error) {
        next(error);
    }
});

router.post('/documents/:id/revert/:revisionId', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const revisionsCollection = db.collection('documentRevisions');
        const { id: docIdParam, revisionId: revIdParam } = req.params;

        if (!ObjectId.isValid(docIdParam) || !ObjectId.isValid(revIdParam)) {
            return res.status(400).json({ message: 'Invalid document or revision ID' });
        }
        const documentId = new ObjectId(docIdParam);
        const revisionId = new ObjectId(revIdParam);

        const currentDocument = await itemsCollection.findOne({ _id: documentId, type: 'document' });
        if (!currentDocument || currentDocument.storageType === 'r2') {
            return res.status(400).json({ message: 'Cannot revert R2 stored files or document not found.' });
        }

        const targetRevision = await revisionsCollection.findOne({ _id: revisionId, documentId: documentId });
        if (!targetRevision) {
            return res.status(404).json({ message: 'Target revision not found or does not belong to this document' });
        }


        const latestRevisionArray = await revisionsCollection.find({ documentId: documentId }).sort({ version: -1 }).limit(1).toArray();
        const nextVersion = latestRevisionArray.length > 0 ? latestRevisionArray[0].version + 1 : 1;
        const preRevertRevision = {
            documentId: documentId,
            content: currentDocument.content,
            isMarkdownContent: currentDocument.isMarkdownContent || false,
            version: nextVersion,
            savedAt: currentDocument.updatedAt || new Date(),
        };
        await revisionsCollection.insertOne(preRevertRevision);

        await itemsCollection.updateOne(
            { _id: documentId },
            { $set: { content: targetRevision.content, isMarkdownContent: targetRevision.isMarkdownContent, updatedAt: new Date() } }
        );
        res.json({ message: `Document reverted to version ${targetRevision.version}` });
    } catch (error) {
        next(error);
    }
});

// --- Search Route & Tags Route (remain unchanged but are included for completeness) ---
router.get('/search', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const query = req.query.q;

        if (!query) {
            return res.status(400).json({ message: "Search query 'q' is required." });
        }
        // Search only inline content for now, R2 file content search is more complex
        const searchResults = await itemsCollection
            .find(
                { $text: { $search: query }, type: "document", storageType: "inline" },
                { score: { $meta: "textScore" } }
            )
            .sort({ score: { $meta: "textScore" } })
            .limit(20)
            .toArray();
        const resultsWithId = searchResults.map(item => ({ ...item, id: item._id.toString() }));
        res.json(resultsWithId);
    } catch (error) {
        next(error);
    }
});
router.put('/documents/:id/tags', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const { id } = req.params;
        const { tags } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid document ID' });
        }
        if (!Array.isArray(tags)) {
            return res.status(400).json({ message: 'Tags must be an array' });
        }

        const cleanedTags = tags.map(tag => String(tag).trim()).filter(Boolean);

        const result = await itemsCollection.updateOne(
            { _id: new ObjectId(id), type: 'document' },
            { $set: { tags: cleanedTags, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json({ message: 'Tags updated successfully', tags: cleanedTags });
    } catch (error) {
        next(error);
    }
});

module.exports = router;