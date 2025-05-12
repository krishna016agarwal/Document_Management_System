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
                        backgroundColor: snapshot.isDragging ? '#d0eaff' : (String(item.id) === String(activeItemId) ? '#007bff' : 'transparent'),
                        color: snapshot.isDragging ? '#212529' : (String(item.id) === String(activeItemId) ? 'white' : 'inherit'),
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
                        {item.type === 'category' ? '📁' : '📄'} {item.name}
                    </span>
                    <button
                        className="options-btn"
                        style={{ color: (String(item.id) === String(activeItemId) && !snapshot.isDragging) ? 'white' : '#555' }}
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
                                <div style={{ paddingLeft: '20px' }}>
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
        // Get theme from localStorage or default to system preference/light
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
     useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = () => {
        setIsDarkMode(prevMode => !prevMode);
    };
    const [breadcrumbPath, setBreadcrumbPath] = useState([]);
    const [expandedItems, setExpandedItems] = useState({});
    const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
    const [revisionTargetDoc, setRevisionTargetDoc] = useState({ id: null, name: '' });

    const selectedItem = activeItemId ? findItemById(data, activeItemId) : null;

    function findItemById(items, id) {
         for (const item of items) {
             if (String(item.id) === String(id)) return item;
             if (item.children && item.children.length > 0) {
                 const foundInChildren = findItemById(item.children, String(id));
                 if (foundInChildren) return foundInChildren;
             }
         }
         return null;
     }

    const buildBreadcrumbPath = useCallback((itemId, currentData) => {
        if (!itemId || !currentData || currentData.length === 0) {
            setBreadcrumbPath([]); return;
        }
        const path = [];
        let currentItem = findItemById(currentData, String(itemId));
        while (currentItem) {
            path.unshift({ id: String(currentItem.id), name: currentItem.name, type: currentItem.type });
            if (currentItem.parentId) {
                currentItem = findItemById(currentData, String(currentItem.parentId));
            } else { currentItem = null; }
        }
        setBreadcrumbPath(path);
    }, []);

    const fetchStructure = useCallback(async (selectIdAfterFetch = null, preserveExpansion = false) => {
        let previousExpansionState = preserveExpansion ? { ...expandedItems } : {};
        try {
            setIsLoadingStructure(true);
            const response = await fetch('/api/structure');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
                throw new Error(errData.message || 'Failed to fetch structure');
            }
            const fetchedData = await response.json();
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
                        return itemsInLevel[0];
                    };
                    const itemToSelectInitially = findFirstSuitableItem(fetchedData);
                    if(itemToSelectInitially) initialActiveIdForExpansionPath = String(itemToSelectInitially.id);
                }

                if (initialActiveIdForExpansionPath) {
                    let tempCurrent = findItemById(fetchedData, initialActiveIdForExpansionPath);
                    while(tempCurrent) {
                        newInitialExpansion[String(tempCurrent.id)] = true;
                        if(tempCurrent.parentId) {
                            newInitialExpansion[String(tempCurrent.parentId)] = true;
                            tempCurrent = findItemById(fetchedData, tempCurrent.parentId);
                        } else { tempCurrent = null; }
                    }
                } else {
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
                setActiveItemId(idToSelect);
            } else if (fetchedData.length > 0) {
                const findFirstSuitableItem = (itemsInLevel) => { /* same as above */ return itemsInLevel[0];};
                const itemToSelect = findFirstSuitableItem(fetchedData) || fetchedData[0];
                if (itemToSelect) {
                    idToUpdatePathFor = String(itemToSelect.id);
                    setActiveItemId(idToUpdatePathFor);
                }
            } else { setActiveItemId(null); }
            buildBreadcrumbPath(idToUpdatePathFor, fetchedData);
        } catch (error) {
            console.error("Error fetching initial structure:", error);
            setActiveDocumentContent(`<p style="color:red;">Error loading site structure. ${error.message}</p>`);
            setData([]);
            buildBreadcrumbPath(null, []);
        } finally { setIsLoadingStructure(false); }
    }, [activeItemId, buildBreadcrumbPath, expandedItems]);

    useEffect(() => { fetchStructure(null, false); // eslint-disable-next-line
    }, []);

    useEffect(() => {
        if (activeItemId && data.length > 0) {
            buildBreadcrumbPath(activeItemId, data);
            const newExpanded = { ...expandedItems };
            let current = findItemById(data, activeItemId);
            let expansionChanged = false;
            while(current && current.parentId) {
                if (!newExpanded[String(current.parentId)]) {
                    newExpanded[String(current.parentId)] = true;
                    expansionChanged = true;
                }
                current = findItemById(data, current.parentId);
            }
            if (expansionChanged) setExpandedItems(newExpanded);
        } else if (!activeItemId) { setBreadcrumbPath([]); } // eslint-disable-next-line
    }, [activeItemId, data]);

    useEffect(() => {
        if (selectedItem && selectedItem.type === 'document') {
            setIsLoadingContent(true);
            if (selectedItem.content !== undefined) {
                if (selectedItem.isMarkdownContent) {
                    setActiveDocumentContent(marked.parse(selectedItem.content));
                } else { setActiveDocumentContent(selectedItem.content); }
            } else { setActiveDocumentContent('<p>Content not available for this document.</p>'); }
            setIsLoadingContent(false);
        } else if (selectedItem && selectedItem.type === 'category') {
            setActiveDocumentContent(`<p>This is the '<strong>${selectedItem.name}</strong>' category. Select a document or add a sub-item.</p>`);
            setIsLoadingContent(false);
        } else if (!isLoadingStructure && data.length === 0) {
             setActiveDocumentContent('<p>No items yet. Click "+" in the sidebar to add a category.</p>');
             setIsLoadingContent(false);
        } else if (!isLoadingStructure && !selectedItem) {
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
        if (contextMenu.visible) { document.addEventListener('click', handleHideContextMenu);
            return () => document.removeEventListener('click', handleHideContextMenu);
        }
    }, [contextMenu.visible, handleHideContextMenu]);
    const onToggleExpand = useCallback((itemId) => { setExpandedItems(prev => ({ ...prev, [String(itemId)]: !prev[String(itemId)] })); }, []);
    const openAddDocumentModal = (parentId = null) => {
        const parentItem = parentId ? findItemById(data, String(parentId)) : null;
        setAddDocumentParentInfo({ id: parentId ? String(parentId) : null, name: parentItem ? parentItem.name : '' });
        setIsAddDocumentModalOpen(true); handleHideContextMenu();
    };




    const handleSaveNewItem = async (newItemDataFromModal, parentIdForModal) => {
           try {
             // newItemDataFromModal would need to include 'tags' if AddDocumentModal supported it
             const response = await fetch('/api/items', {
                 method: 'POST', headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ parentId: parentIdForModal ? String(parentIdForModal) : null, itemData: newItemDataFromModal }),
             });
            if (!response.ok) { const errData = await response.json().catch(() => ({ message: 'Failed to save' })); throw new Error(errData.message); }
            const savedItem = await response.json();
             await fetchStructure(String(savedItem.id), true);
             if (parentIdForModal) { setExpandedItems(prev => ({...prev, [String(parentIdForModal)]: true})); } 
        } catch (error) { console.error('Error saving new item:', error); alert(`Error: ${error.message}`); }
    };



    const handleAddItem = async (parentId = null, type = 'category') => {
        if (type === 'document') { openAddDocumentModal(parentId ? String(parentId) : null); return; }
        const name = prompt(`Enter name for new ${type}:`);
        if (!name || !name.trim()) return;
        const newItemData = { name: name.trim(), type: type };
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
                await fetchStructure(activeItemId, true);
            } catch (error) { console.error('Error renaming item:', error); alert(`Error: ${error.message}`); }
        }
    };
    const handleDeleteItem = async () => {
        const { targetId } = contextMenu; if (!targetId) return;
        if (!confirm('Are you sure you want to delete this item and all its children?')) { return; }
        try {
            const response = await fetch(`/api/items/${targetId}`, { method: 'DELETE' });
            if (!response.ok) { const errData = await response.json().catch(() => ({message: 'Failed to delete'})); throw new Error(errData.message); }
            let newActiveItemId = null;
            if (activeItemId === targetId) {
                const deletedItem = findItemById(data, targetId);
                if (deletedItem && deletedItem.parentId) newActiveItemId = String(deletedItem.parentId);
            } else { newActiveItemId = activeItemId; }
            await fetchStructure(newActiveItemId, true);
        } catch (error) { console.error('Error deleting item:', error); alert(`Error: ${error.message}`); }
    };







   const handleOpenEditModal = async () => {
        if (selectedItem && selectedItem.type === 'document') {
            setEditingDocument({
                id: String(selectedItem.id),
                name: selectedItem.name,
                content: selectedItem.content || '',
                originalIsMarkdown: selectedItem.isMarkdownContent || false,
                tags: selectedItem.tags || [], // Pass current tags
            });
            setIsEditModalOpen(true);
        }
        handleHideContextMenu();
    };

    
    const handleCloseEditModal = () => { setIsEditModalOpen(false); setEditingDocument(null); };



     const handleSaveEditedDocument = async (newContent, receivedTags) => { // Renamed param for clarity
        if (!editingDocument || !editingDocument.id) return;
        try {
            const response = await fetch(`/api/documents/${String(editingDocument.id)}/content`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newContent,
                    isMarkdownContent: editingDocument.originalIsMarkdown,
                    tags: receivedTags, // <<< ***** CORRECTED: Use the receivedTags parameter *****
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({message: 'Failed to save document'}));
                throw new Error(errData.message);
            }
            await fetchStructure(String(editingDocument.id), true); // Preserve expansion, re-select
        } catch (error) {
            console.error('Error saving edited document:', error);
            alert(`Error saving document: ${error.message}`);
        }
        handleCloseEditModal();
    };

    const handleOpenRevisionHistory = () => {
        if (selectedItem && selectedItem.type === 'document') {
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
        if (newParentStrId === "root-droppable") newParentStrId = null;
        else {
            const parentItem = findItemById(data, newParentStrId);
            if (!parentItem || parentItem.type !== 'category') { console.warn("Invalid drop target."); return; }
        }
        if (newParentStrId === draggedItemStrId) { console.warn("Cannot drag into self."); return; }
        let tempParent = newParentStrId ? findItemById(data, newParentStrId) : null;
        while(tempParent) {
            if(String(tempParent.id) === draggedItemStrId) { console.warn("Cannot drag parent into child."); return; }
            tempParent = tempParent.parentId ? findItemById(data, String(tempParent.parentId)) : null;
        }
        try {
            setIsLoadingStructure(true);
            const response = await fetch(`/api/items/${draggedItemStrId}/position`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newParentId: newParentStrId }),
            });
            if (!response.ok) { const errData = await response.json().catch(() => ({message: 'Failed to move'})); throw new Error(errData.message); }
            await fetchStructure(activeItemId === draggedItemStrId ? draggedItemStrId : activeItemId, true);
        } catch (error) {
            console.error('Error updating item position:', error); alert(`Error: ${error.message}`);
            await fetchStructure(activeItemId, true);
        }
    };

    if (isLoadingStructure && data.length === 0) {
        return <div className="app-container" style={{justifyContent: 'center', alignItems: 'center', height: '100vh'}}><h2>Loading Documentation System...</h2></div>;
    }



    
    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="app-container">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <h2>DOCUMENTATION</h2>
                          <div> {/* Wrapper for buttons */}
                            <ThemeToggle isDarkMode={isDarkMode} onToggle={toggleTheme} />
                            <button onClick={() => handleAddItem(null, 'category')} title="Add Top-Level Category" style={{marginLeft: '8px'}}>+</button>
                        </div>
                    </div>
                    {isLoadingStructure && data.length === 0 ? (
                        <p style={{ padding: '10px', color: '#555' }}>Loading tree...</p>
                    ) : !isLoadingStructure && data.length === 0 ? (
                        <p style={{ padding: '10px', color: '#555' }}>No items. Click '+' to add a category.</p>
                    ) : (
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
                            <li>Click '⋮' on items for options.</li>
                        </ul>
                    </div>
                </aside>
                <main className="content-pane">
                   <Breadcrumbs path={breadcrumbPath} onCrumbClick={handleCrumbClick} />
                    <div className="content-header">
                        <h1>{selectedItem ? selectedItem.name : (data.length > 0 ? 'Select an item' : 'No Content')}</h1>
                        {selectedItem && selectedItem.type === 'document' && (
                            <>
                                {selectedItem.updatedAt && (
                                  <p id="documentLastUpdated">Last updated: {new Date(selectedItem.updatedAt).toLocaleDateString()}</p>
                                )}
                                <button className="history-btn" onClick={handleOpenRevisionHistory} title="View Revision History">History</button>
                                <button id="editDocumentBtn" onClick={handleOpenEditModal}>Edit</button>
                            </>
                        )}
                    </div>

   {/* Display Tags for selected document */}
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
                        <div className="context-menu-item" onClick={() => { handleRenameItem(); handleHideContextMenu(); }}>Rename</div>
                        {contextMenu.itemType === 'category' && (
                            <>
                                <div className="context-menu-item" onClick={() => { handleAddItem(contextMenu.targetId, 'category'); handleHideContextMenu(); }}>Add Subcategory</div>
                                <div className="context-menu-item" onClick={() => { handleAddItem(contextMenu.targetId, 'document'); handleHideContextMenu(); }}>Add Document</div>
                            </>
                        )}
                        {selectedItem && String(selectedItem.id) === contextMenu.targetId && selectedItem.type === 'document' && (
                             <>
                                <div className="context-menu-item" onClick={() => { handleOpenEditModal(); handleHideContextMenu();}}>Edit Document</div>
                                <div className="context-menu-item" onClick={() => { handleOpenRevisionHistory(); handleHideContextMenu();}}>View History</div>
                             </>
                        )}
                        <div className="context-menu-item delete" onClick={() => { handleDeleteItem(); handleHideContextMenu(); }}>Delete</div>
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