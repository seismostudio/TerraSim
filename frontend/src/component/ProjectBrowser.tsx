import React, { useState } from 'react';
import { useAppContext } from '../App';
import { ArrowDownToDotIcon, ChevronDownIcon } from 'lucide-react';
import './ProjectBrowser.css';
import PointLoadItem from './PointLoadItem';

interface ProjectBrowserProps {
  className?: string;
  onEditMaterial?: (material: any) => void;
}

const ProjectBrowser: React.FC<ProjectBrowserProps> = ({ className = '', onEditMaterial }) => {
  const { 
    polygons, 
    setPolygons,
    nodeList, 
    elementList, 
    boundaryConditionListFullFixed, 
    boundaryConditionListNormalFixed, 
    loadList,
    materialList,
    deleteMaterial,
    assignMaterialToPolygon,
    selectedPolygonId,
    setSelectedPolygonId,
    pointLoadList,
    updatePointLoad,
    deletePointLoad
  } = useAppContext();
  const [expandedSections, setExpandedSections] = useState<{
    geometry: boolean;
    nodes: boolean;
    elements: boolean;
    materials: boolean;
    polygons: boolean;
    boundaryConditions: boolean;
    loads: boolean;
    analysis: boolean;
  }>({
    geometry: true,
    nodes: false,
    elements: false,
    materials: true,
    polygons: true,
    boundaryConditions: false,
    loads: true,
    analysis: false
  });

  const [materialDropdownOpen, setMaterialDropdownOpen] = useState<string | null>(null);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getPolygonName = (index: number) => {
    return `Polygon${index + 1}`;
  };

  const getMaterialName = (materialId: string | undefined) => {
    if (!materialId) return 'No Material';
    const material = materialList.find(m => m.id === materialId);
    return material ? material.name : 'Unknown Material';
  };

  const getMaterialColor = (materialId: string | undefined) => {
    if (!materialId) return '#999';
    const material = materialList.find(m => m.id === materialId);
    return material ? material.color : '#999';
  };

  const toggleMaterialDropdown = (materialId: string) => {
    setMaterialDropdownOpen(materialDropdownOpen === materialId ? null : materialId);
  };

  const handleEditMaterial = (materialId: string) => {
    const material = materialList.find(m => m.id === materialId);
    if (material && onEditMaterial) {
      onEditMaterial(material);
    }
    setMaterialDropdownOpen(null);
  };

  const handleDeleteMaterial = (materialId: string) => {
    deleteMaterial(materialId);
    setMaterialDropdownOpen(null);
  };

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (materialDropdownOpen && !(event.target as Element).closest('.material-actions')) {
        setMaterialDropdownOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [materialDropdownOpen]);

  return (
    <div className={`w-1/5 border-r border-gray-200 ${className}`}>
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-base font-semibold">Project Browser</h3>
      </div>
      
      <div className="project-browser-content">
        {/* Geometry Section */}
        <div className="browser-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('geometry')}
          >
            <span className="section-icon">
              {expandedSections.geometry ? '▼' : '▶'}
            </span>
            <span className="section-title">Geometry</span>
          </div>
          
          {expandedSections.geometry && (
            <div className="section-content">
              {polygons.length === 0 ? (
                <div className="empty-state">
                  <span>No polygons created</span>
                </div>
              ) : (
                <div className="polygon-list">
                  {polygons.map((polygon: any, index: number) => {
                    const polygonId = polygon.id || `polygon_${index}`;
                    const isSelected = selectedPolygonId === polygonId;
                    return (
                      <div 
                        key={polygonId} 
                        className={`polygon-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedPolygonId(polygonId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Delete' && isSelected) {
                            e.preventDefault();
                            e.stopPropagation();
                            // Remove the polygon from the list
                            setPolygons(prevPolygons => 
                              prevPolygons.filter(polygon => 
                                (polygon.id || `polygon_${prevPolygons.indexOf(polygon)}`) !== polygonId
                              )
                            );
                            setSelectedPolygonId(null);
                          }
                        }}
                        tabIndex={0}
                      >
                        <div className="polygon-info">
                          <span className="polygon-name">{getPolygonName(index)}</span>
                        </div>
                        <div className="polygon-material-info">
                          <div 
                            className="polygon-material-color" 
                            style={{ backgroundColor: getMaterialColor(polygon.materialId) }}
                          ></div>
                          <span className="polygon-material-name">{getMaterialName(polygon.materialId)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Materials Section */}
        <div className="browser-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('materials')}
          >
            <span className="section-icon">
              {expandedSections.materials ? '▼' : '▶'}
            </span>
            <span className="section-title">Materials</span>
          </div>
          
          {expandedSections.materials && (
            <div className="section-content">
              {materialList.length === 0 ? (
                <div className="empty-state">
                  <span>No materials defined</span>
                </div>
              ) : (
                <div className="material-list">
                  {materialList.map((material: any, index: number) => {
                    const materialId = material.id || `material_${index}`;
                    const isDropdownOpen = materialDropdownOpen === materialId;
                    return (
                      <div 
                        key={materialId} 
                        className="material-item text-xs px-2"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'material',
                            materialId: materialId,
                            materialName: material.name || `Material ${index + 1}`,
                            materialColor: material.color || '#8B4513'
                          }));
                        }}
                      >
                        <div className="flex flex-row gap-2 justify-start items-center">
                          <div className="material-color-box" style={{ backgroundColor: material.color || '#8B4513' }}></div>
                          <span className="material-name">
                            {material.name || `Material ${index + 1}`}
                          </span>
                        </div>
                        <div className="material-actions p-2">
                          <button
                            className="material-dropdown-toggle p-1 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMaterialDropdown(materialId);
                            }}
                          >
                            ⋮
                          </button>
                          {isDropdownOpen && (
                            <div className="material-dropdown-menu">
                              <button
                                className="dropdown-item edit-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditMaterial(materialId);
                                }}
                              >
                                Edit Material
                              </button>
                              <button
                                className="dropdown-item delete-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMaterial(materialId);
                                }}
                              >
                                Delete Material
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loads Section */}
        <div className="browser-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('loads')}
          >
            <span className="section-icon">
              {expandedSections.loads ? '▼' : '▶'}
            </span>
            <span className="section-title">Loads</span>
          </div>
          
          {expandedSections.loads && (
            <div className="section-content">
              {/* Regular Loads */}
              <div>
                <h4 className="text-xs font-semibold border-b border-gray-200 p-2">Line Loads</h4>
                {loadList.length === 0 ? (
                  <div className="empty-state">
                    <span>No node loads defined</span>
                  </div>
                ) : (
                  <div className="load-list">
                    <div className="list-header">
                      <span className="header-item">Node</span>
                      <span className="header-item">Fx (kN)</span>
                      <span className="header-item">Fy (kN)</span>
                    </div>
                    {loadList.map((load: any, index: number) => (
                      <div key={`load-${load.node}-${index}`} className="list-item">
                        <span className="item-value">{load.node}</span>
                        <span className="item-value">{load.fx.toFixed(2)}</span>
                        <span className="item-value">{load.fy.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Point Loads */}
              <div>
                <h4 className="text-xs font-semibold border-b border-t border-gray-200 p-2">Point Loads</h4>
                {pointLoadList.length === 0 ? (
                  <div className="empty-state">
                    <span>No point loads defined</span>
                  </div>
                ) : (
                  <div className="point-load-list">
                    {pointLoadList.map((pointLoad) => (
                      <PointLoadItem 
                        key={pointLoad.id} 
                        pointLoad={pointLoad}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Nodes Section */}
        <div className="browser-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('nodes')}
          >
            <span className="section-icon">
              {expandedSections.nodes ? '▼' : '▶'}
            </span>
            <span className="section-title">Nodes</span>
          </div>
          
          {expandedSections.nodes && (
            <div className="section-content">
              {nodeList.length === 0 ? (
                <div className="empty-state">
                  <span>No nodes defined</span>
                </div>
              ) : (
                <div className="node-list">
                  <div className="list-header">
                    <span className="header-item">ID</span>
                    <span className="header-item">X</span>
                    <span className="header-item">Y</span>
                  </div>
                  {nodeList.map((node: any) => (
                    <div key={node.id} className="list-item">
                      <span className="item-value">{node.id}</span>
                      <span className="item-value">{node.x.toFixed(2)}</span>
                      <span className="item-value">{node.y.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Elements Section */}
        <div className="browser-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('elements')}
          >
            <span className="section-icon">
              {expandedSections.elements ? '▼' : '▶'}
            </span>
            <span className="section-title">Elements</span>
          </div>
          
          {expandedSections.elements && (
            <div className="section-content">
              {elementList.length === 0 ? (
                <div className="empty-state">
                  <span>No elements defined</span>
                </div>
              ) : (
                <div className="element-list">
                  <div className="list-header">
                    <span className="header-item">ID</span>
                    <span className="header-item">Node 1</span>
                    <span className="header-item">Node 2</span>
                    <span className="header-item">Node 3</span>
                  </div>
                  {elementList.map((element: any) => (
                    <div key={element.id} className="list-item">
                      <span className="item-value">{element.id}</span>
                      <span className="item-value">{element.node1}</span>
                      <span className="item-value">{element.node2}</span>
                      <span className="item-value">{element.node3}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>


        {/* Boundary Conditions Section */}
        <div className="browser-section">
          <div 
            className="section-header"
            onClick={() => toggleSection('boundaryConditions')}
          >
            <span className="section-icon">
              {expandedSections.boundaryConditions ? '▼' : '▶'}
            </span>
            <span className="section-title">Boundary Conditions</span>
          </div>
          
          {expandedSections.boundaryConditions && (
            <div className="section-content">
              {boundaryConditionListFullFixed.length === 0 && boundaryConditionListNormalFixed.length === 0 ? (
                <div className="empty-state">
                  <span>No boundary conditions defined</span>
                </div>
              ) : (
                <div className="boundary-condition-list">
                  {/* Full Fixed Boundary Conditions */}
                  {boundaryConditionListFullFixed.length > 0 && (
                    <div className="bc-subsection">
                      <div className="subsection-title">Full Fixed</div>
                      <div className="list-header">
                        <span className="header-item">Node ID</span>
                      </div>
                      {boundaryConditionListFullFixed.map((bc: any, index: number) => {
                        const nodeId = typeof bc === 'number' ? bc : bc.node;
                        return (
                          <div key={`full-fixed-${nodeId}-${index}`} className="list-item">
                            <span className="item-value">{nodeId}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Normal Fixed Boundary Conditions */}
                  {boundaryConditionListNormalFixed.length > 0 && (
                    <div className="bc-subsection">
                      <div className="subsection-title">Normal Fixed</div>
                      <div className="list-header">
                        <span className="header-item">Node ID</span>
                      </div>
                      {boundaryConditionListNormalFixed.map((bc: any, index: number) => {
                        const nodeId = typeof bc === 'number' ? bc : bc.node;
                        return (
                          <div key={`normal-fixed-${nodeId}-${index}`} className="list-item">
                            <span className="item-value">{nodeId}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectBrowser; 