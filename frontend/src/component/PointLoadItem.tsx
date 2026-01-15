import React, { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { useAppContext } from '../App';

interface PointLoad {
    id: string;
    x: number;
    y: number;
    fx: number;
    fy: number;
    node?: number; // Node ID (optional, will be assigned after mesh generation)
}

interface PointLoadItemProps {
    pointLoad: PointLoad;
}

const PointLoadItem: React.FC<PointLoadItemProps> = ({ pointLoad }) => {
    const { updatePointLoad, deletePointLoad } = useAppContext();
    const [isEditing, setIsEditing] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [editedPointLoad, setEditedPointLoad] = useState<PointLoad>(pointLoad);

    const handleSave = () => {
        updatePointLoad(pointLoad.id, editedPointLoad);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditedPointLoad(pointLoad);
        setIsEditing(false);
    };

    const handleDelete = () => {
        deletePointLoad(pointLoad.id);
    };

    const toggleDropdown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDropdownOpen(!isDropdownOpen);
    };

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isDropdownOpen && !(event.target as Element).closest('.pointload-actions')) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    const magnitude = Math.sqrt(pointLoad.fx * pointLoad.fx + pointLoad.fy * pointLoad.fy);

    return (
        <div className="pointload-item flex flex-col w-full text-xs bg-gray-50 p-2">
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Point Load</span>
                    <span className="text-xs text-gray-500">{pointLoad.node ? `(${pointLoad.node})` : 'Not assigned (generate mesh first)'}</span>
                </div>
                <div className="pointload-actions">
                    <button
                        className="pointload-dropdown-toggle"
                        onClick={toggleDropdown}
                    >
                        ⋮
                    </button>
                    {isDropdownOpen && (
                        <div className="pointload-dropdown-menu">
                            <button
                                className="dropdown-item edit-item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditing(true);
                                    setIsDropdownOpen(false);
                                }}
                            >
                                Edit
                            </button>
                            <button
                                className="dropdown-item delete-item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete();
                                    setIsDropdownOpen(false);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {isEditing ? (
                <div className="edit-form">
                    <div className="form-row">
                        <label>Position:</label>
                        <input
                            type="number"
                            value={editedPointLoad.x}
                            onChange={(e) => setEditedPointLoad({...editedPointLoad, x: parseFloat(e.target.value)})}
                            step="0.1"
                            className="form-input"
                        />
                        <input
                            type="number"
                            value={editedPointLoad.y}
                            onChange={(e) => setEditedPointLoad({...editedPointLoad, y: parseFloat(e.target.value)})}
                            step="0.1"
                            className="form-input"
                        />
                    </div>
                    <div className="form-row">
                        <label>Force:</label>
                        <input
                            type="number"
                            value={editedPointLoad.fx}
                            onChange={(e) => setEditedPointLoad({...editedPointLoad, fx: parseFloat(e.target.value)})}
                            step="0.1"
                            className="form-input"
                        />
                        <input
                            type="number"
                            value={editedPointLoad.fy}
                            onChange={(e) => setEditedPointLoad({...editedPointLoad, fy: parseFloat(e.target.value)})}
                            step="0.1"
                            className="form-input"
                        />
                    </div>
                    <div className="form-actions">
                        <button onClick={handleSave} className="save-btn">Save</button>
                        <button onClick={handleCancel} className="cancel-btn">Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2 w-full">
                    <div className="info-row">
                        <span className="label">Position:</span>
                        <span className="value">({pointLoad.x.toFixed(2)}, {pointLoad.y.toFixed(2)}) m</span>
                    </div>
                    <div className="info-row">
                        <span className="value">Fx = {pointLoad.fx.toFixed(2)} kN</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Magnitude:</span>
                        <span className="value">{magnitude.toFixed(2)} kN</span>
                    </div>
                    <div className="info-row">
                        <span className="value">Fy = {pointLoad.fy.toFixed(2)} kN</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PointLoadItem; 