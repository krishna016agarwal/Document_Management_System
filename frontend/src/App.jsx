import React, { useState, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './App.css';
import EditModal from './EditModal';
import AddDocumentModal from './AddDocumentModal';
import Breadcrumbs from './Breadcrumbs';
import RevisionHistoryModal from './RevisionHistoryModal';

// --- Recursive CategoryItem Component ---
function CategoryItem({ item, level, onSelectItem, onShowContextMenu, activeItemId, index, isExpanded, onToggleExpand }) {
    const handleToggleExpandInternal = (e) => {
        e.stopPropagation();
        if (item.type === 'category' && onToggleExpand) {
            onToggleExpand(String(item.id));
        }
    };
    const itemStyle = { paddingLeft: `${5 + level * 20}px` };

    return (
        <Draggable draggableId={String(item.id)} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    data-id={String(item.id)}
                    style={{
                        ...itemStyle,
                        ...provided.draggableProps.style,
                        backgroundColor: snapshot.isDragging ? 'var(--bg-hover)' : (String(item.id) === String(activeItemId) ? 'var(--bg-active)' : 'transparent'),
                        color: snapshot.isDragging ? 'var(--text-primary)' : (String(item.id) === String(activeItemId) ? 'var(--text-active)' : 'inherit'),
                        paddingTop: '8px', paddingBottom: '8px', marginBottom: '4px',
                        borderRadius: '4px', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                    }}
                    className={`category-item-draggable ${String(item.id) === String(activeItemId) && !snapshot.isDragging ? 'active' : ''}`}
                    onClick={() => onSelectItem(String(item.id))}
                >
                    <span className="item-name">
                        {item.type === 'category' && (
                            <span onClick={handleToggleExpandInternal} style={{ marginRight: '5px', display: 'inline-block', cursor: 'pointer' }}>
                                {isExpanded ? '▼' : '►'}
                            </span>
                        )}
                        {item.type === 'category' ? '📁' : (item.storageType === 'r2' && item.fileDetails?.mimeType?.startsWith('image/') ? '🖼️' : (item.storageType === 'r2' && item.fileDetails?.mimeType === 'application/pdf' ? '📜' : '📄'))} {item.name}
                    </span>
                    <button
                        className="options-btn"
                        style={{ color: (String(item.id) === String(activeItemId) && !snapshot.isDragging) ? 'var(--text-active)' : 'var(--text-secondary)' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onShowContextMenu(e, String(item.id), item.type);
                        }}
                    >⋮</button>
                </div>
            )}
        </Draggable>
    );
}

// --- Helper to render the tree recursively ---
function RenderDraggableTree({ items, level, onSelectItem, onShowContextMenu, activeItemId, parentDroppableId = "root-droppable", expandedItems, onToggleExpand }) {
    return (
        <Droppable droppableId={String(parentDroppableId)} type="ITEM">
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                        background: snapshot.isDraggingOver ? 'rgba(0, 123, 255, 0.05)' : 'transparent',
                        padding: snapshot.isDraggingOver ? '5px' : '0',
                        minHeight: items.length === 0 && snapshot.isDraggingOver ? '50px' : 'auto',
                        borderRadius: '4px',
                    }}
                    className="category-tree-droppable-list"
                >
                    {items.map((item, index) => (
                        <React.Fragment key={String(item.id)}>
                            <CategoryItem
                                item={item}
                                level={level}
                                onSelectItem={onSelectItem}
                                onShowContextMenu={onShowContextMenu}
                                activeItemId={activeItemId}
                                index={index}
                                isExpanded={!!expandedItems[String(item.id)]}
                                onToggleExpand={onToggleExpand}
                            />
                            {item.type === 'category' && item.children && item.children.length > 0 && expandedItems[String(item.id)] && (
                                <div style={{ paddingLeft: '0px' }}> {/* Adjusted padding, CategoryItem handles its own padding */}
                                    <RenderDraggableTree
                                        items={item.children}
                                        level={level + 1}
                                        onSelectItem={onSelectItem}
                                        onShowContextMenu={onShowContextMenu}
                                        activeItemId={activeItemId}
                                        parentDroppableId={String(item.id)}
                                        expandedItems={expandedItems}
                                        onToggleExpand={onToggleExpand}
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                    {provided.placeholder}
                </div>
            )}
        </Droppable>
    );
}


// --- ThemeToggle Component ---
function ThemeToggle({ isDarkMode, onToggle }) {
    return (
        <button onClick={onToggle} className="theme-toggle-btn" title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            {isDarkMode ? '☀️' : '🌙'}
        </button>
    );
}
// --- Main App Component ---
function App() {
    const [data, setData] = useState([]);
    const [activeItemId, setActiveItemId] = useState(null);
    const [activeDocumentContent, setActiveDocumentContent] = useState('');
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [isLoadingStructure, setIsLoadingStructure] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingDocument, setEditingDocument] = useState(null);
    const [isAddDocumentModalOpen, setIsAddDocumentModalOpen] = useState(false);
    const [addDocumentParentInfo, setAddDocumentParentInfo] = useState({ id: null, name: '' });
    const [contextMenu, setContextMenu] = useState({
        visible: false, x: 0, y: 0, targetId: null, itemType: null,
    });
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
     useEffect(() => {
        document.body.classList.toggle('dark-mode', isDarkMode);
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(prevMode => !prevMode);
    const [breadcrumbPath, setBreadcrumbPath] = useState([]);
    const [expandedItems, setExpandedItems] = useState({});
    const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
    const [revisionTargetDoc, setRevisionTargetDoc] = useState({ id: null, name: '' });

    const selectedItem = activeItemId ? findItemById(data, activeItemId) : null;

    // findItemById searches the entire tree starting from the 'items' array (which is the root 'data' state)
    function findItemById(items, idToFind) {
         for (const item of items) {
             if (String(item.id) === String(idToFind)) return item;
             if (item.children && item.children.length > 0) {
                 const foundInChildren = findItemById(item.children, String(idToFind));
                 if (foundInChildren) return foundInChildren;
             }
         }
         return null;
     }

    const buildBreadcrumbPath = useCallback((itemId, currentDataRoot) => {
        if (!itemId || !currentDataRoot || currentDataRoot.length === 0) {
            setBreadcrumbPath([]); return;
        }
        const path = [];
        let currentItem = findItemById(currentDataRoot, String(itemId)); // Search from the root
        while (currentItem) {
            path.unshift({ id: String(currentItem.id), name: currentItem.name, type: currentItem.type });
            if (currentItem.parentId) {
                currentItem = findItemById(currentDataRoot, String(currentItem.parentId)); // Search for parent from the root
            } else { currentItem = null; }
        }
        setBreadcrumbPath(path);
    }, []); // findItemById is stable if defined outside or memoized if inside and using props/state

    const fetchStructure = useCallback(async (selectIdAfterFetch = null, preserveExpansion = false) => {
        let previousExpansionState = preserveExpansion ? { ...expandedItems } : {};
        try {
            setIsLoadingStructure(true);
            const response = await fetch('/api/structure');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
                throw new Error(errData.message || 'Failed to fetch structure');
            }
            const fetchedData = await response.json(); // This is already a tree from the backend
            setData(fetchedData);

            if (preserveExpansion) {
                setExpandedItems(previousExpansionState);
            } else {
                const newInitialExpansion = {};
                let initialActiveIdForExpansionPath = null;
                const idToUseForInitialSelection = selectIdAfterFetch ? String(selectIdAfterFetch) : (activeItemId ? String(activeItemId) : null);

                if (idToUseForInitialSelection && findItemById(fetchedData, idToUseForInitialSelection)) {
                    initialActiveIdForExpansionPath = idToUseForInitialSelection;
                } else if (fetchedData.length > 0) {
                    const findFirstSuitableItem = (itemsInLevel) => {
                        for (const item of itemsInLevel) { if (item.type === 'document') return item; }
                        for (const item of itemsInLevel) {
                            if (item.type === 'category' && item.children && item.children.length > 0) {
                                const foundInChild = findFirstSuitableItem(item.children);
                                if (foundInChild) return foundInChild;
                            }
                        }
                        return itemsInLevel[0]; // Fallback
                    };
                    const itemToSelectInitially = findFirstSuitableItem(fetchedData);
                    if(itemToSelectInitially) initialActiveIdForExpansionPath = String(itemToSelectInitially.id);
                }

                if (initialActiveIdForExpansionPath) {
                    let tempCurrent = findItemById(fetchedData, initialActiveIdForExpansionPath);
                    while(tempCurrent) {
                        if(tempCurrent.type === 'category') newInitialExpansion[String(tempCurrent.id)] = true; // Only expand categories
                        if(tempCurrent.parentId) {
                            const parent = findItemById(fetchedData, String(tempCurrent.parentId));
                            if(parent && parent.type === 'category') newInitialExpansion[String(parent.id)] = true;
                            tempCurrent = parent;
                        } else { tempCurrent = null; }
                    }
                } else { // Default expansion for top-level categories if no specific item path
                    fetchedData.forEach(item => {
                        if (item.type === 'category') newInitialExpansion[String(item.id)] = true;
                    });
                }
                setExpandedItems(newInitialExpansion);
            }

            let idToUpdatePathFor = null;
            const idToSelect = selectIdAfterFetch ? String(selectIdAfterFetch) : activeItemId ? String(activeItemId) : null;

            if (idToSelect && findItemById(fetchedData, idToSelect)) {
                idToUpdatePathFor = idToSelect;
                setActiveItemId(idToSelect); // Keep current or set new
            } else if (fetchedData.length > 0) {
                // Try to find first document, then first category, then first item
                const findFirstSuitableItem = (itemsInLevel) => {
                    let firstDoc = null, firstCat = null, firstItem = null;
                    function search(items) {
                        for (const item of items) {
                            if (!firstItem) firstItem = item;
                            if (item.type === 'document' && !firstDoc) firstDoc = item;
                            if (item.type === 'category' && !firstCat) firstCat = item;
                            if (item.children) search(item.children);
                        }
                    }
                    search(itemsInLevel);
                    return firstDoc || firstCat || firstItem || itemsInLevel[0];
                };
                const itemToSelect = findFirstSuitableItem(fetchedData);
                if (itemToSelect) {
                    idToUpdatePathFor = String(itemToSelect.id);
                    setActiveItemId(idToUpdatePathFor);
                }
            } else {
                setActiveItemId(null); // No items, clear activeId
            }
            buildBreadcrumbPath(idToUpdatePathFor, fetchedData);
        } catch (error) {
            console.error("Error fetching initial structure:", error);
            setActiveDocumentContent(`<p style="color:red;">Error loading site structure. ${error.message}</p>`);
            setData([]);
            buildBreadcrumbPath(null, []);
        } finally { setIsLoadingStructure(false); }
    }, [activeItemId, buildBreadcrumbPath, expandedItems]); // findItemById removed from deps

    useEffect(() => { fetchStructure(null, false); // eslint-disable-next-line
    }, []); // Initial fetch

    useEffect(() => { // Update breadcrumbs and expand path to active item
        if (activeItemId && data.length > 0) {
            buildBreadcrumbPath(activeItemId, data);
            const newExpanded = { ...expandedItems };
            let current = findItemById(data, activeItemId);
            let expansionChanged = false;
            while(current && current.parentId) {
                const parent = findItemById(data, String(current.parentId));
                if (parent && parent.type === 'category' && !newExpanded[String(parent.id)]) {
                    newExpanded[String(parent.id)] = true;
                    expansionChanged = true;
                }
                current = parent;
            }
            if (expansionChanged) setExpandedItems(newExpanded);
        } else if (!activeItemId) { setBreadcrumbPath([]); }
    }, [activeItemId, data, buildBreadcrumbPath, expandedItems]);


    useEffect(() => { // Display content of selected item
        if (selectedItem && selectedItem.type === 'document') {
            setIsLoadingContent(true);
            if (selectedItem.storageType === 'r2' && selectedItem.fileDetails && selectedItem.fileDetails.url) {
                const { url, mimeType, originalName, size } = selectedItem.fileDetails;
                const fileSizeMB = size ? (size / (1024 * 1024)).toFixed(2) + ' MB' : '';
                if (mimeType === 'application/pdf') {
                    setActiveDocumentContent(`<embed src="${url}" type="application/pdf" width="100%" height="calc(100vh - 220px)" title="${originalName}" />`);
                } else if (mimeType && mimeType.startsWith('image/')) {
                    setActiveDocumentContent(`<div style="text-align: center;"><img src="${url}" alt="${originalName}" style="max-width: 100%; max-height: calc(100vh - 180px); display: inline-block; border-radius: 4px;" /></div>`);
                } else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    setActiveDocumentContent(
                        `<div class="file-preview-placeholder">
                            <p>Preview for Word documents (.doc, .docx) is not directly available.</p>
                            <p>File: ${originalName} (${fileSizeMB})</p>
                            <a href="${url}" download="${originalName || 'document'}" class="download-link">Download Document</a>
                        </div>`
                    );
                } else { // Fallback for other R2 types
                    setActiveDocumentContent(
                        `<div class="file-preview-placeholder">
                            <p>Preview for this file type (${mimeType || 'unknown'}) is not available.</p>
                            <p>File: ${originalName} (${fileSizeMB})</p>
                            <a href="${url}" download="${originalName || 'file'}" class="download-link">Download File</a>
                        </div>`
                    );
                }
            } else if (selectedItem.isMarkdownContent) { // Inline MD
                setActiveDocumentContent(marked.parse(selectedItem.content || ''));
            } else { // Inline HTML or blank
                setActiveDocumentContent(selectedItem.content || '<p>Empty document.</p>');
            }
            setIsLoadingContent(false);
        } else if (selectedItem && selectedItem.type === 'category') {
            setActiveDocumentContent(`<p>This is the '<strong>${selectedItem.name}</strong>' category. Select a document or add a sub-item.</p>`);
            setIsLoadingContent(false);
        } else if (!isLoadingStructure && data.length === 0) { // No items after load
             setActiveDocumentContent('<p>No items yet. Click "+" in the sidebar to add a category.</p>');
             setIsLoadingContent(false);
        } else if (!isLoadingStructure && !selectedItem && data.length > 0) { // Loaded, items exist, but nothing selected
            setActiveDocumentContent('<p>Select an item from the sidebar.</p>');
            setIsLoadingContent(false);
        }
    }, [selectedItem, isLoadingStructure, data]);

    const handleSelectItem = (itemId) => { setActiveItemId(String(itemId)); setIsEditModalOpen(false); handleHideContextMenu(); };
    const handleCrumbClick = (itemId) => {
        const item = findItemById(data, String(itemId));
        if (item) {
            handleSelectItem(String(itemId));
            if (item.type === 'category') {
                setExpandedItems(prev => ({ ...prev, [String(itemId)]: true }));
            }
        }
    };
    const handleShowContextMenu = (event, itemId, itemType) => {
        event.preventDefault(); event.stopPropagation();
        setContextMenu({ visible: true, x: event.pageX, y: event.pageY, targetId: String(itemId), itemType: itemType });
    };
    const handleHideContextMenu = useCallback(() => { setContextMenu(prev => ({ ...prev, visible: false })); }, []);
    useEffect(() => {
        if (contextMenu.visible) { document.addEventListener('click', handleHideContextMenu); }
        return () => document.removeEventListener('click', handleHideContextMenu);
    }, [contextMenu.visible, handleHideContextMenu]);

    const onToggleExpand = useCallback((itemId) => {
        setExpandedItems(prev => ({ ...prev, [String(itemId)]: !prev[String(itemId)] }));
    }, []);

    const openAddDocumentModal = (parentId = null) => {
        const parentItem = parentId ? findItemById(data, String(parentId)) : null;
        setAddDocumentParentInfo({ id: parentId ? String(parentId) : null, name: parentItem ? parentItem.name : '' });
        setIsAddDocumentModalOpen(true); handleHideContextMenu();
    };

    const handleSaveNewItem = async (newItemDataFromModal, parentIdForModal) => {
           try {
             let response;
             const { localFile, ...itemDetails } = newItemDataFromModal;

             if (localFile) { // File upload for R2 (PDF, image, docx etc.)
                 const formData = new FormData();
                 formData.append('file', localFile);
                 formData.append('name', itemDetails.name);
                 formData.append('type', itemDetails.type || 'document'); // Ensure type is 'document'
                 formData.append('parentId', parentIdForModal ? String(parentIdForModal) : ''); // Backend expects empty string or valid ID
                 // Tags are not currently collected in AddDocumentModal for FormData.
                 // If they were, they'd be: formData.append('tags', JSON.stringify(itemDetails.tags || []));


                 response = await fetch('/api/items', { method: 'POST', body: formData });
             } else { // Blank document or .md/.html content (JSON request)
                 response = await fetch('/api/items', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         parentId: parentIdForModal ? String(parentIdForModal) : null,
                         itemData: itemDetails // Contains name, type, content, isMarkdownContent
                     }),
                 });
             }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ message: `Failed to save. Server responded with ${response.status}` }));
                throw new Error(errData.message);
            }
            const savedItem = await response.json();
             await fetchStructure(String(savedItem.id), true); // Re-fetch and select the new item
             if (parentIdForModal) {
                const parent = findItemById(data, String(parentIdForModal)); // Re-find parent in possibly updated data
                if(parent && parent.type === 'category') setExpandedItems(prev => ({...prev, [String(parentIdForModal)]: true}));
             }
        } catch (error) { console.error('Error saving new item:', error); alert(`Error: ${error.message}`); }
    };

    const handleAddItem = async (parentId = null, type = 'category') => {
        if (type === 'document') { openAddDocumentModal(parentId ? String(parentId) : null); return; }
        const name = prompt(`Enter name for new ${type}:`);
        if (!name || !name.trim()) return;
        const newItemData = { name: name.trim(), type: type }; // For categories, this is simple
        await handleSaveNewItem(newItemData, parentId ? String(parentId) : null);
    };

    const handleRenameItem = async () => {
        const { targetId } = contextMenu; if (!targetId) return;
        const item = findItemById(data, targetId); if (!item) { alert("Item not found."); return; }
        const newName = prompt('Enter new name:', item.name);
        if (newName && newName.trim() && newName !== item.name) {
            try {
                const response = await fetch(`/api/items/${targetId}/rename`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: newName.trim() }),
                });
                if (!response.ok) { const errData = await response.json().catch(() => ({message: 'Failed to rename'})); throw new Error(errData.message); }
                await fetchStructure(activeItemId, true); // Re-fetch, keep current active item
            } catch (error) { console.error('Error renaming item:', error); alert(`Error: ${error.message}`); }
        }
        handleHideContextMenu();
    };

    const handleDeleteItem = async () => {
        const { targetId } = contextMenu; if (!targetId) return;
        const itemToDelete = findItemById(data, targetId);
        if (!itemToDelete) { alert("Item not found for deletion."); handleHideContextMenu(); return; }

        const confirmMessage = itemToDelete.type === 'category'
            ? 'Are you sure you want to delete this category and all its contents (subcategories and documents)? Associated files will also be deleted from storage.'
            : 'Are you sure you want to delete this document? The file will also be deleted from storage.';

        if (!confirm(confirmMessage)) { handleHideContextMenu(); return; }

        try {
            const response = await fetch(`/api/items/${targetId}`, { method: 'DELETE' });
            if (!response.ok) { const errData = await response.json().catch(() => ({message: 'Failed to delete'})); throw new Error(errData.message); }

            let newActiveItemId = null;
            if (activeItemId === targetId) { // If deleted item was active
                if (itemToDelete.parentId) {
                    newActiveItemId = String(itemToDelete.parentId); // Try to select parent
                } else {
                    // If top-level deleted, newActiveItemId remains null, fetchStructure will pick a new default
                }
            } else {
                newActiveItemId = activeItemId; // Keep current active item if it wasn't the one deleted
            }
            await fetchStructure(newActiveItemId, true);
        } catch (error) { console.error('Error deleting item:', error); alert(`Error: ${error.message}`); }
        handleHideContextMenu();
    };

   const handleOpenEditModal = async () => {
        if (selectedItem && selectedItem.type === 'document') {
            if (selectedItem.storageType === 'r2') {
                alert("Direct editing for this file type (e.g., PDF, image, DOCX) is not supported. To change the file, please delete this item and upload a new version.");
                handleHideContextMenu();
                return;
            }
            // Only for inline content (HTML, Markdown)
            setEditingDocument({
                id: String(selectedItem.id),
                name: selectedItem.name,
                content: selectedItem.content || '', // Ensure content is not undefined
                originalIsMarkdown: selectedItem.isMarkdownContent || false,
                tags: selectedItem.tags || [],
            });
            setIsEditModalOpen(true);
        }
        handleHideContextMenu();
    };
    
    const handleCloseEditModal = () => { setIsEditModalOpen(false); setEditingDocument(null); };

     const handleSaveEditedDocument = async (newContent, receivedTags) => {
        if (!editingDocument || !editingDocument.id) return;
        // This function is only for inline content, as per handleOpenEditModal logic
        try {
            const response = await fetch(`/api/documents/${String(editingDocument.id)}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newContent,
                    isMarkdownContent: editingDocument.originalIsMarkdown,
                    tags: receivedTags,
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({message: 'Failed to save document'}));
                throw new Error(errData.message);
            }
            await fetchStructure(String(editingDocument.id), true); // Re-fetch and re-select
        } catch (error) {
            console.error('Error saving edited document:', error);
            alert(`Error saving document: ${error.message}`);
        }
        handleCloseEditModal();
    };

    const handleOpenRevisionHistory = () => {
        if (selectedItem && selectedItem.type === 'document') {
            if (selectedItem.storageType === 'r2') {
                alert("Revision history is not available for files like PDFs, images, or Word documents. It only applies to text-based documents edited in the system.");
                handleHideContextMenu();
                return;
            }
            setRevisionTargetDoc({ id: String(selectedItem.id), name: selectedItem.name });
            setIsRevisionModalOpen(true);
        }
        handleHideContextMenu();
    };
    const handleRevertSuccess = () => { if (activeItemId) { fetchStructure(activeItemId, true); } };

    const onDragEnd = async (result) => {
        const { source, destination, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        const draggedItemStrId = String(draggableId);
        let newParentStrId = String(destination.droppableId);
        if (newParentStrId === "root-droppable") newParentStrId = null; // Dropped at root
        else { // Dropped into a category
            const parentItem = findItemById(data, newParentStrId); // data is the current tree
            if (!parentItem || parentItem.type !== 'category') {
                console.warn("Invalid drop target (not a category or not found)."); return;
            }
        }

        // Prevent dragging item into itself or a parent into its child
        if (newParentStrId === draggedItemStrId) { console.warn("Cannot drag item into itself."); return; }
        let tempParent = newParentStrId ? findItemById(data, newParentStrId) : null;
        while(tempParent) { // Check ancestry of the new parent
            if(String(tempParent.id) === draggedItemStrId) { console.warn("Cannot drag a parent item into one of its children."); return; }
            tempParent = tempParent.parentId ? findItemById(data, String(tempParent.parentId)) : null;
        }

        try {
            setIsLoadingStructure(true);
            const response = await fetch(`/api/items/${draggedItemStrId}/position`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newParentId: newParentStrId }), // Backend expects null or valid ObjectId string
            });
            if (!response.ok) { const errData = await response.json().catch(() => ({message: 'Failed to move item'})); throw new Error(errData.message); }
            // Re-fetch structure. If activeItem was dragged, it remains active.
            await fetchStructure(activeItemId, true); // Preserve expansion
        } catch (error) {
            console.error('Error updating item position:', error); alert(`Error: ${error.message}`);
            await fetchStructure(activeItemId, true); // Fetch again on error to reset state
        } finally {
            // setIsLoadingStructure(false); // fetchStructure will set this
        }
    };

    if (isLoadingStructure && data.length === 0) { // Initial loading screen
        return <div className="app-container" style={{justifyContent: 'center', alignItems: 'center', height: '100vh'}}><h2>Loading Documentation System...</h2></div>;
    }
    
    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="app-container">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <h2>DOCUMENTATION</h2>
                          <div>
                            <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
                            <button onClick={() => handleAddItem(null, 'category')} title="Add Top-Level Category" style={{marginLeft: '8px'}}>+</button>
                        </div>
                    </div>
                    {isLoadingStructure && data.length > 0 ? ( /* Loading but previous data exists */
                        <p style={{ padding: '10px', color: 'var(--text-secondary)' }}>Updating tree...</p>
                    ) : !isLoadingStructure && data.length === 0 ? ( /* Loaded, no items */
                        <p style={{ padding: '10px', color: 'var(--text-secondary)' }}>No items. Click '+' to add a category.</p>
                    ) : ( /* Loaded, items exist */
                        <RenderDraggableTree
                            items={data} level={0}
                            onSelectItem={handleSelectItem} onShowContextMenu={handleShowContextMenu}
                            activeItemId={activeItemId} parentDroppableId="root-droppable"
                            expandedItems={expandedItems} onToggleExpand={onToggleExpand}
                        />
                    )}
                    <div className="quick-tips">
                        <h4>⚡ Quick Tips</h4>
                        <ul>
                            <li>Drag & drop to re-parent items.</li>
                            <li>Right-click or click '⋮' for options.</li>
                        </ul>
                    </div>
                </aside>
                <main className="content-pane">
                   <Breadcrumbs path={breadcrumbPath} onCrumbClick={handleCrumbClick} />
                    <div className="content-header">
                        <h1>{selectedItem ? selectedItem.name : (data.length > 0 ? 'Select an item' : 'No Content Yet')}</h1>
                        {selectedItem && selectedItem.type === 'document' && (
                            <div className="content-header-actions">
                                {selectedItem.updatedAt && (
                                  <p id="documentLastUpdated">Last updated: {new Date(selectedItem.updatedAt).toLocaleDateString()}</p>
                                )}
                                {selectedItem.storageType !== 'r2' && ( /* Only for inline text docs */
                                    <button className="history-btn" onClick={handleOpenRevisionHistory} title="View Revision History">History</button>
                                )}
                                {selectedItem.storageType !== 'r2' ? ( /* Only for inline text docs */
                                    <button id="editDocumentBtn" onClick={handleOpenEditModal}>Edit</button>
                                ) : (
                                    selectedItem.fileDetails?.url && <a href={selectedItem.fileDetails.url} target="_blank" rel="noopener noreferrer" download={selectedItem.fileDetails.originalName || selectedItem.name} className="download-link" id="downloadFileBtn" title="Download File">Download</a>
                                )}
                            </div>
                        )}
                    </div>

                    {selectedItem && selectedItem.type === 'document' && selectedItem.tags && selectedItem.tags.length > 0 && (
                        <div className="document-tags-container">
                            {selectedItem.tags.map(tag => (
                                <span key={tag} className="document-tag-item">{tag}</span>
                            ))}
                        </div>
                    )}
                    
                    {isLoadingContent ? ( <p>Loading content...</p> ) : (
                        <div id="documentContent" className="document-body" dangerouslySetInnerHTML={{ __html: activeDocumentContent }} />
                    )}
                </main>
                {contextMenu.visible && (
                    <div id="contextMenu" className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()} >
                        <div className="context-menu-item" onClick={() => { handleRenameItem(); /* handleHideContextMenu is called in handleRenameItem */ }}>Rename</div>
                        {contextMenu.itemType === 'category' && (
                            <>
                                <div className="context-menu-item" onClick={() => { handleAddItem(contextMenu.targetId, 'category'); handleHideContextMenu(); }}>Add Subcategory</div>
                                <div className="context-menu-item" onClick={() => { handleAddItem(contextMenu.targetId, 'document'); handleHideContextMenu(); }}>Add Document</div>
                            </>
                        )}
                        {selectedItem && String(selectedItem.id) === contextMenu.targetId && selectedItem.type === 'document' && selectedItem.storageType !== 'r2' && (
                             <>
                                <div className="context-menu-item" onClick={() => { handleOpenEditModal(); /* handleHideContextMenu called inside */}}>Edit Document</div>
                                <div className="context-menu-item" onClick={() => { handleOpenRevisionHistory();  /* handleHideContextMenu called inside */}}>View History</div>
                             </>
                        )}
                        <div className="context-menu-item delete" onClick={() => { handleDeleteItem(); /* handleHideContextMenu called inside */ }}>Delete</div>
                    </div>
                )}
                {editingDocument && ( <EditModal isOpen={isEditModalOpen} onClose={handleCloseEditModal} initialContent={editingDocument.content} onSave={handleSaveEditedDocument}  initialTags={editingDocument.tags} documentName={editingDocument.name} /> )}
                <AddDocumentModal isOpen={isAddDocumentModalOpen} onClose={() => setIsAddDocumentModalOpen(false)} onSave={(docData) => handleSaveNewItem(docData, addDocumentParentInfo.id)} parentName={addDocumentParentInfo.name} />
                <RevisionHistoryModal isOpen={isRevisionModalOpen} onClose={() => setIsRevisionModalOpen(false)} documentId={revisionTargetDoc.id} documentName={revisionTargetDoc.name} onRevertSuccess={handleRevertSuccess} />
            </div>
        </DragDropContext>
    );
}
export default App;