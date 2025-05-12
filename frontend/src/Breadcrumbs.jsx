import React from 'react';
import './Breadcrumbs.css';

const Breadcrumbs = ({ path, onCrumbClick }) => {
    if (!path || path.length === 0) {
        return null;
    }

    return (
        <nav aria-label="breadcrumb" className="breadcrumbs-container">
            <ol className="breadcrumb-list">
                {path.map((crumb, index) => (
                    <li key={crumb.id || `crumb-${index}`} className="breadcrumb-item">
                        {index < path.length - 1 ? (
                            <button onClick={() => onCrumbClick(crumb.id)} className="breadcrumb-link">
                                {crumb.name}
                            </button>
                        ) : (
                            <span className="breadcrumb-current" aria-current="page">
                                {crumb.name}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
};

export default Breadcrumbs;