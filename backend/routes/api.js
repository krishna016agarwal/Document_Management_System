const express = require('express');
const { getDB, ObjectId } = require('../db');

const router = express.Router();

// Helper to build tree structure from flat list of items
function buildTree(items, parentId = null) {
    const tree = [];
    items.forEach(item => {
        const itemParentId = item.parentId ? String(item.parentId) : null;
        const targetParentId = parentId ? String(parentId) : null;

        if (itemParentId === targetParentId) {
            const children = buildTree(items, item._id); // Pass item._id as ObjectId for recursive calls
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
        
        // Convert _id to id (string) for frontend compatibility
        const itemsWithId = allItems.map(item => ({ ...item, id: item._id.toString() }));
        
        const treeStructure = buildTree(itemsWithId, null);
        res.json(treeStructure);
    } catch (error) {
        next(error);
    }
});

// --- Item (Category/Document) Routes ---

// Add item (category or document)
router.post('/items', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const { parentId, itemData } = req.body;

        if (!itemData || !itemData.name || !itemData.type) {
            return res.status(400).json({ message: 'Missing item data fields (name, type are required)' });
        }

         const newItem = {
            name: itemData.name,
            type: itemData.type,
            parentId: parentId ? new ObjectId(parentId) : null,
            content: itemData.type === 'document' ? (itemData.content || '') : undefined,
            isMarkdownContent: itemData.type === 'document' ? !!itemData.isMarkdownContent : undefined,
            tags: itemData.type === 'document' ? (itemData.tags || []) : [], // Add tags for documents
            createdAt: new Date(),
            updatedAt: new Date(),
        };
         if (itemData.type === 'category') {
             // children array is implicitly handled by buildTree, no need to store empty array unless specifically desired for queries
         }

         
        const result = await itemsCollection.insertOne(newItem);
        res.status(201).json({ ...newItem, _id: result.insertedId, id: result.insertedId.toString() });
    } catch (error) {
        if (error.name === 'BSONTypeError' || (error.message && error.message.includes("Argument passed in must be a string of 12 bytes"))) {
            return res.status(400).json({ message: "Invalid parentId format." });
        }
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

// Update document content (Versioning Aware)
router.put('/documents/:id/content', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const revisionsCollection = db.collection('documentRevisions');
        const { id } = req.params;
        const { content: newContent, isMarkdownContent: newIsMarkdownContent } = req.body;

        if (newContent === undefined) {
            return res.status(400).json({ message: 'Content is required' });
        }
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid document ID format' });
        }

         const { tags } = req.body; // Expect tags in the request body

        const documentId = new ObjectId(id);
        const currentDocument = await itemsCollection.findOne({ _id: documentId, type: 'document' });

        if (!currentDocument) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // 1. Create a revision of the *current* content before updating
        if (currentDocument.content !== undefined) {
            const latestRevisionArray = await revisionsCollection.find({ documentId: documentId })
                                        .sort({ version: -1 }).limit(1).toArray();
            const nextVersion = latestRevisionArray.length > 0 ? latestRevisionArray[0].version + 1 : 1;

            const revision = {
                documentId: documentId,
                content: currentDocument.content,
                isMarkdownContent: currentDocument.isMarkdownContent || false, // Ensure boolean
                version: nextVersion,
                savedAt: currentDocument.updatedAt || currentDocument.createdAt || new Date(),
                // savedBy: req.user ? new ObjectId(req.user.id) : null, // Placeholder for auth
            };
            await revisionsCollection.insertOne(revision);
        }

        // 2. Update the main document with new content
        const updateFields = {
            content: newContent,
            isMarkdownContent: !!newIsMarkdownContent,
            updatedAt: new Date()
        };
        if (tags !== undefined && Array.isArray(tags)) { // Only update tags if provided
            updateFields.tags = tags.map(tag => String(tag).trim()).filter(Boolean); // Clean and store tags
        }

        const result = await itemsCollection.updateOne(
            { _id: documentId },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return res.status(500).json({ message: 'Document found but failed to update (internal error)' });
        }
        res.json({ message: 'Document content updated and revision saved', id });
    } catch (error) {
        next(error);
    }
});

// Delete item and its children (if category), and its revisions
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

        const idsToDeleteFromItems = [itemId];

        if (itemToDelete.type === 'category') {
            const allItems = await itemsCollection.find({}).toArray(); // Potentially slow for very large trees
            const getDescendantIds = (currentIdStr) => {
                let descIds = [];
                const directChildren = allItems.filter(item => item.parentId && String(item.parentId) === currentIdStr);
                directChildren.forEach(child => {
                    descIds.push(child._id); // Store ObjectId
                    descIds = descIds.concat(getDescendantIds(String(child._id)));
                });
                return descIds;
            }
            const descendantIds = getDescendantIds(String(itemId));
            idsToDeleteFromItems.push(...descendantIds);
        }
        
        // Ensure all IDs are ObjectIds for the $in query
        const objectIdsToDelete = idsToDeleteFromItems.map(idVal => idVal instanceof ObjectId ? idVal : new ObjectId(idVal));

        // Delete items from 'items' collection
        const deleteItemsResult = await itemsCollection.deleteMany({ _id: { $in: objectIdsToDelete } });

        // Delete all revisions associated with any of the deleted documents
        await revisionsCollection.deleteMany({ documentId: { $in: objectIdsToDelete } });

        res.json({ message: `${deleteItemsResult.deletedCount} item(s) and their revisions/children deleted successfully`, id });
    } catch (error) {
        next(error);
    }
});

// --- Item Position Update Route (for D&D) ---
router.put('/items/:id/position', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const { id } = req.params;
        const { newParentId /*, newIndex */ } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid item ID format for position update' });
        }
        if (newParentId !== null && !ObjectId.isValid(newParentId)) {
            return res.status(400).json({ message: 'Invalid new parent ID format for position update' });
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
            return res.status(404).json({ message: 'Item not found for position update' });
        }
        res.json({ message: 'Item position updated successfully' });
    } catch (error) {
        next(error);
    }
});

// --- Document Revision Routes ---
router.get('/documents/:id/revisions', async (req, res, next) => {
    try {
        const db = getDB();
        const revisionsCollection = db.collection('documentRevisions');
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid document ID format for fetching revisions' });
        }
        const documentId = new ObjectId(id);

        const revisions = await revisionsCollection.find({ documentId: documentId })
                                .sort({ version: -1 })
                                .project({ content: 0 }) // Exclude content for list view
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
            return res.status(400).json({ message: 'Invalid document or revision ID format for revert' });
        }
        const documentId = new ObjectId(docIdParam);
        const revisionId = new ObjectId(revIdParam);

        const targetRevision = await revisionsCollection.findOne({ _id: revisionId, documentId: documentId });
        if (!targetRevision) {
            return res.status(404).json({ message: 'Target revision not found or does not belong to this document' });
        }

        const currentDocument = await itemsCollection.findOne({ _id: documentId, type: 'document' });
        if (!currentDocument) {
            return res.status(404).json({ message: 'Current document not found for revert' });
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

// --- Search Route ---
router.get('/search', async (req, res, next) => {
    try {
        const db = getDB();
        const itemsCollection = db.collection('items');
        const query = req.query.q;

        if (!query) {
            return res.status(400).json({ message: "Search query 'q' is required." });
        }
        const searchResults = await itemsCollection
            .find(
                { $text: { $search: query }, type: "document" },
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