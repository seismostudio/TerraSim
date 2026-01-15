"""
Mesh Generator Module
Implements unstructured Delaunay triangulation with boundary refinement
"""

import numpy as np
from scipy.spatial import Delaunay
from scipy.spatial.distance import cdist
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
import matplotlib.tri as tri

class MeshGenerator:
    def __init__(self, polygon):
        """
        Initialize mesh generator with polygon data
        
        Args:
            polygon: Polygon object containing vertices and mesh parameters
        """
        self.polygon = polygon
        self.nodes = None
        self.elements = None
        self.boundary_nodes = None
        
    def generate_boundary_points(self):
        """
        Generate boundary points with forced interpolation on all segments
        """
        print(f"DEBUG: mesh_size={self.polygon.mesh_size}, boundary_refinement_factor={self.polygon.boundary_refinement_factor}")
        boundary_points = []
        verts = self.polygon.vertices
        n = len(verts)
        for i in range(n):
            start = verts[i]
            end = verts[(i + 1) % n]
            segment = end - start
            length = np.linalg.norm(segment)
            # Use boundary refinement factor for boundary point density
            num_points = max(3, int(np.ceil(length / (self.polygon.mesh_size * self.polygon.boundary_refinement_factor))) + 1)
            print(f"DEBUG: Segment {i}: length={length:.3f}, num_points={num_points}")
            for j in range(num_points):
                t = j / (num_points - 1)
                pt = start + t * segment
                boundary_points.append(pt.tolist())
        # Remove duplicates
        unique_points = []
        seen = set()
        for point in boundary_points:
            point_tuple = (round(point[0], 6), round(point[1], 6))
            if point_tuple not in seen:
                seen.add(point_tuple)
                unique_points.append(point)
        print(f"Boundary points: {len(unique_points)} (forced interpolation)")
        return np.array(unique_points)
    
    def generate_interior_points(self, boundary_points):
        """
        Generate interior points using regular grid with consistent mesh size
        """
        # Create bounding box
        min_coords = np.min(boundary_points, axis=0)
        max_coords = np.max(boundary_points, axis=0)
        
        print(f"DEBUG: Bounding box: x=[{min_coords[0]:.3f}, {max_coords[0]:.3f}], y=[{min_coords[1]:.3f}, {max_coords[1]:.3f}]")
        
        # Add proper padding to ensure coverage
        padding = self.polygon.mesh_size * 3  # Increased padding
        min_coords -= padding
        max_coords += padding
        
        # Use mesh_size directly for grid spacing
        x_range = np.arange(min_coords[0], max_coords[0] + self.polygon.mesh_size, self.polygon.mesh_size)
        y_range = np.arange(min_coords[1], max_coords[1] + self.polygon.mesh_size, self.polygon.mesh_size)
        
        print(f"DEBUG: Grid spacing: x_points={len(x_range)}, y_points={len(y_range)}")
        print(f"DEBUG: Expected grid density: {len(x_range) * len(y_range)} total points")
        
        X, Y = np.meshgrid(x_range, y_range)
        candidate_points = np.column_stack([X.ravel(), Y.ravel()])
        
        print(f"DEBUG: Total candidate points: {len(candidate_points)}")
        
        # Filter points that are inside the polygon
        interior_points = []
        for point in candidate_points:
            if self.is_point_inside_polygon(point):
                interior_points.append(point.tolist())
        
        print(f"Interior points: {len(interior_points)}")
        return np.array(interior_points)
    
    def is_point_inside_polygon(self, point):
        """
        Check if a point is inside the polygon using ray casting algorithm
        """
        x, y = point
        vertices = self.polygon.vertices
        
        return self._ray_casting(x, y, vertices)
    
    def _ray_casting(self, x, y, vertices):
        """
        Ray casting algorithm to determine if point is inside polygon
        """
        n = len(vertices)
        inside = False
        
        p1x, p1y = vertices[0]
        for i in range(n + 1):
            p2x, p2y = vertices[i % n]
            
            # Check if point is on boundary
            if self._point_on_line_segment(x, y, p1x, p1y, p2x, p2y):
                return True
            
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    def _point_on_line_segment(self, x, y, x1, y1, x2, y2):
        """
        Check if point (x,y) is on line segment from (x1,y1) to (x2,y2)
        """
        # Check if point is within bounding box
        if x < min(x1, x2) or x > max(x1, x2) or y < min(y1, y2) or y > max(y1, y2):
            return False
        
        # Check if point is on line (using cross product)
        if abs((x2 - x1) * (y - y1) - (x - x1) * (y2 - y1)) < 1e-10:
            return True
        
        return False
    
    def generate_mesh(self):
        """
        Generate complete mesh using Delaunay triangulation with boundary refinement
        """
        print("="*50)
        print("MESH GENERATION DEBUG:")
        print(f"  Mesh size: {self.polygon.mesh_size}")
        print(f"  Boundary refinement factor: {self.polygon.boundary_refinement_factor}")
        print(f"  Polygon vertices: {len(self.polygon.vertices)}")
        print("="*50)
        
        print("Generating boundary points...")
        boundary_points = self.generate_boundary_points()
        
        print("Generating interior points...")
        interior_points = self.generate_interior_points(boundary_points)
        
        # Combine all points and remove duplicates
        if len(interior_points) > 0:
            all_points = np.vstack([boundary_points, interior_points])
        else:
            all_points = boundary_points
        
        # Remove duplicate points with very loose rounding
        unique_points = []
        seen = set()
        for point in all_points:
            point_tuple = (round(point[0], 3), round(point[1], 3))  # Very loose rounding
            if point_tuple not in seen:
                seen.add(point_tuple)
                unique_points.append(point)
        
        all_points = np.array(unique_points)
        
        print(f"Total points: {len(all_points)}")
        print(f"Boundary points: {len(boundary_points)}")
        print(f"Interior points: {len(interior_points)}")
        print(f"Unique points after deduplication: {len(unique_points)}")
        print(f"DEBUG: Mesh size effect - Expected more points for smaller mesh size")
        
        # Perform Delaunay triangulation
        print("Performing Delaunay triangulation...")
        print(f"DEBUG: Input points for triangulation: {len(all_points)}")
        tri = Delaunay(all_points)
        print(f"DEBUG: Raw triangles from Delaunay: {len(tri.simplices)}")
        
        # Filter triangles that are inside the polygon and not degenerate
        print("Filtering triangles...")
        valid_triangles = []
        inside_count = 0
        degenerate_count = 0
        
        for i, simplex in enumerate(tri.simplices):
            triangle_points = all_points[simplex]
            centroid = np.mean(triangle_points, axis=0)
            
            # Check if triangle is inside polygon
            if self.is_point_inside_polygon(centroid):
                inside_count += 1
                # Check if triangle is not degenerate (has reasonable area)
                x1, y1 = triangle_points[0]
                x2, y2 = triangle_points[1]
                x3, y3 = triangle_points[2]
                area = 0.5 * abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
                
                if area > 1e-12:  # Keep only elements with reasonable area
                    valid_triangles.append(simplex)
                else:
                    degenerate_count += 1
                    if degenerate_count <= 3:  # Only print first few warnings
                        print(f"WARNING: Removed degenerate triangle with area {area:.2e}")
                        print(f"  Node coordinates: ({x1:.6f}, {y1:.6f}), ({x2:.6f}, {y2:.6f}), ({x3:.6f}, {y3:.6f})")
        
        print(f"DEBUG: Triangles inside polygon: {inside_count}")
        print(f"DEBUG: Degenerate triangles removed: {degenerate_count}")
        print(f"DEBUG: Valid triangles kept: {len(valid_triangles)}")
        
        # Store results
        self.nodes = all_points
        self.elements = np.array(valid_triangles)
        
        # ✅ NEW: Initialize element_active array - all elements active by default
        self.element_active = np.ones(len(valid_triangles), dtype=bool)
        
        # Identify boundary nodes
        self.boundary_nodes = self._identify_boundary_nodes()
        
        # Generate automatic boundary conditions
        self.boundary_conditions = self._generate_automatic_boundary_conditions()
        
        print(f"Mesh generation complete!")
        print(f"Nodes: {len(self.nodes)}")
        print(f"Elements: {len(self.elements)}")
        print(f"Active elements: {np.sum(self.element_active)}")
        print(f"Boundary nodes: {len(self.boundary_nodes)}")
        print(f"Boundary conditions generated: {len(self.boundary_conditions['full_fixed'])} full fixed, {len(self.boundary_conditions['normal_fixed'])} normal fixed")
        
        return self.nodes, self.elements, self.boundary_nodes
    
    def generate_mesh_with_priority_nodes(self, polygons_data, materials_data, priority_nodes):
        """
        Generate mesh with point loads as priority nodes for multi-polygon case
        
        Args:
            polygons_data: List of polygon data dictionaries
            materials_data: List of material data dictionaries
            priority_nodes: List of point load coordinates to prioritize
            
        Returns:
            tuple: (nodes, elements, boundary_nodes, element_materials)
        """
        print("="*50)
        print("MULTI-POLYGON MESH GENERATION WITH PRIORITY NODES:")
        print(f"  Number of polygons: {len(polygons_data)}")
        print(f"  Number of materials: {len(materials_data)}")
        print(f"  Priority nodes (point loads): {len(priority_nodes)}")
        print("="*50)
        
        # Extract priority node coordinates and filter only those inside geometry
        priority_coords = []
        for priority_node in priority_nodes:
            point_coord = [priority_node['x'], priority_node['y']]
            
            # Check if point is inside any polygon
            inside_any_polygon = False
            for polygon_data in polygons_data:
                vertices = np.array([[v['x'], v['y']] for v in polygon_data['vertices']])
                if self._is_point_inside_polygon_vertices(point_coord, vertices):
                    inside_any_polygon = True
                    break
            
            if inside_any_polygon:
                priority_coords.append(point_coord)
                print(f"Priority node INSIDE geometry: ({priority_node['x']}, {priority_node['y']})")
            else:
                print(f"Priority node OUTSIDE geometry (ignored): ({priority_node['x']}, {priority_node['y']})")
        
        print(f"Valid priority nodes (inside geometry): {len(priority_coords)}")
        
        # Generate basic mesh first
        nodes, elements, boundary_nodes = self.generate_mesh()
        
        if nodes is None or len(nodes) == 0:
            print("ERROR: Basic mesh generation failed")
            return None, None, None, None
        
        # Ensure priority nodes are included in the mesh
        priority_coords = np.array(priority_coords)
        all_nodes = list(nodes)
        
        for priority_coord in priority_coords:
            # Check if this priority node is already in the mesh (with some tolerance)
            tolerance = self.polygon.mesh_size * self.polygon.boundary_refinement_factor * 0.01  # 1% of mesh size
            found = False
            
            for existing_node in all_nodes:
                distance = np.linalg.norm(np.array(existing_node) - priority_coord)
                if distance < tolerance:
                    found = True
                    print(f"Priority node {priority_coord} already exists as node at {existing_node}")
                    break
            
            if not found:
                # Add priority node to mesh
                all_nodes.append(priority_coord.tolist())
                print(f"Added priority node {priority_coord} to mesh")
        
        # Convert back to numpy array
        all_nodes = np.array(all_nodes)
        
        # Re-triangulate with all nodes including priority nodes
        if len(all_nodes) > 3:
            print("Re-triangulating with priority nodes...")
            tri = Delaunay(all_nodes)
            
            # Filter triangles that are inside any polygon
            valid_triangles = []
            for simplex in tri.simplices:
                triangle_points = all_nodes[simplex]
                centroid = np.mean(triangle_points, axis=0)
                
                # Check if centroid is inside any polygon
                inside_any_polygon = False
                for polygon_data in polygons_data:
                    vertices = np.array([[v['x'], v['y']] for v in polygon_data['vertices']])
                    if self._is_point_inside_polygon_vertices(centroid, vertices):
                        inside_any_polygon = True
                        break
                
                if inside_any_polygon:
                    # Check if triangle is not degenerate
                    x1, y1 = triangle_points[0]
                    x2, y2 = triangle_points[1]
                    x3, y3 = triangle_points[2]
                    area = 0.5 * abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
                    
                    if area > 1e-12:
                        valid_triangles.append(simplex)
            
            elements = np.array(valid_triangles)
            print(f"Re-triangulation complete: {len(elements)} valid elements")
        
        # Create element-material mapping
        element_materials = []
        
        # For multi-polygon case, assign materials based on element centroids
        for elem_idx, element in enumerate(elements):
            # Calculate element centroid
            element_nodes = all_nodes[element]
            centroid = np.mean(element_nodes, axis=0)
            
            # Find which polygon contains this centroid
            assigned_material = None
            for polygon_data in polygons_data:
                if 'materialId' in polygon_data:
                    material_id = polygon_data['materialId']
                    # Find corresponding material
                    for material in materials_data:
                        if material.get('id') == material_id:
                            # Check if centroid is inside this polygon
                            vertices = np.array([[v['x'], v['y']] for v in polygon_data['vertices']])
                            if self._is_point_inside_polygon_vertices(centroid, vertices):
                                assigned_material = material
                                break
                    if assigned_material:
                        break
            
            if assigned_material:
                element_materials.append({
                    'element_id': elem_idx + 1,  # Convert to 1-based indexing
                    'material': assigned_material
                })
            else:
                # Fallback to first material if no assignment found
                if materials_data:
                    element_materials.append({
                        'element_id': elem_idx + 1,
                        'material': materials_data[0]
                    })
                else:
                    print(f"WARNING: No material assigned to element {elem_idx}")
        
        print(f"Element materials assigned: {len(element_materials)}")
        print(f"Final mesh: {len(all_nodes)} nodes, {len(elements)} elements")
        
        return all_nodes, elements, boundary_nodes, element_materials
    
    def _is_point_inside_polygon_vertices(self, point, vertices):
        """
        Check if a point is inside polygon defined by vertices using ray casting
        """
        x, y = point
        n = len(vertices)
        inside = False
        
        p1x, p1y = vertices[0]
        for i in range(n + 1):
            p2x, p2y = vertices[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    def _generate_automatic_boundary_conditions(self):
        """
        Generate automatic boundary conditions:
        - y_min nodes: full fixed
        - x_min and x_max nodes: normal fixed
        """
        if self.nodes is None:
            return {'full_fixed': [], 'normal_fixed': []}
        
        # Calculate bounding box
        min_x = np.min(self.nodes[:, 0])
        max_x = np.max(self.nodes[:, 0])
        min_y = np.min(self.nodes[:, 1])
        max_y = np.max(self.nodes[:, 1])
        
        # Tolerance for floating point comparison
        tolerance = 1e-6
        
        full_fixed_nodes = []  # y_min nodes
        normal_fixed_nodes = []  # x_min and x_max nodes
        
        for i, node in enumerate(self.nodes):
            x, y = node
            
            # Check if node is at y_min (full fixed)
            if abs(y - min_y) < tolerance:
                full_fixed_nodes.append({'node': i})
            
            # Check if node is at x_min or x_max (normal fixed)
            if abs(x - min_x) < tolerance or abs(x - max_x) < tolerance:
                normal_fixed_nodes.append({'node': i})
        
        # Remove duplicates from normal_fixed (nodes at corners might be counted twice)
        seen_nodes = set()
        unique_normal_fixed = []
        for bc in normal_fixed_nodes:
            if bc['node'] not in seen_nodes:
                unique_normal_fixed.append(bc)
                seen_nodes.add(bc['node'])
        
        print(f"Automatic BC generation:")
        print(f"  Bounding box: x=[{min_x:.3f}, {max_x:.3f}], y=[{min_y:.3f}, {max_y:.3f}]")
        print(f"  Full fixed nodes (y_min): {[bc['node'] for bc in full_fixed_nodes]}")
        print(f"  Normal fixed nodes (x_min/x_max): {[bc['node'] for bc in unique_normal_fixed]}")
        
        return {
            'full_fixed': full_fixed_nodes,
            'normal_fixed': unique_normal_fixed
        }
    
    def _identify_boundary_nodes(self):
        """
        Identify boundary nodes by finding nodes that are close to boundary
        """
        boundary_nodes = set()
        
        # Add original boundary vertices
        for i in range(len(self.polygon.vertices)):
            boundary_nodes.add(i)
        
        # Find nodes that are close to boundary segments
        for i in range(len(self.polygon.vertices)):
            start_vertex = self.polygon.vertices[i]
            end_vertex = self.polygon.vertices[(i + 1) % len(self.polygon.vertices)]
            
            # Find nodes close to this boundary segment
            for j, node in enumerate(self.nodes):
                if j >= len(self.polygon.vertices):  # Skip original vertices
                    # Check if node is close to boundary segment using boundary refinement factor
                    if self._point_to_line_distance(node, start_vertex, end_vertex) < self.polygon.mesh_size * self.polygon.boundary_refinement_factor:
                        boundary_nodes.add(j)
        
        return list(boundary_nodes)
    
    def _point_to_line_distance(self, point, line_start, line_end):
        """
        Calculate distance from point to line segment
        """
        line_vec = line_end - line_start
        point_vec = point - line_start
        
        line_length = np.linalg.norm(line_vec)
        if line_length == 0:
            return np.linalg.norm(point_vec)
        
        t = np.dot(point_vec, line_vec) / (line_length ** 2)
        t = max(0, min(1, t))  # Clamp to line segment
        
        projection = line_start + t * line_vec
        return np.linalg.norm(point - projection)
    
    def get_mesh_data(self):
        """
        Return mesh data in the format expected by the FEA solver
        """
        if self.nodes is None or self.elements is None:
            raise ValueError("Mesh not generated yet. Call generate_mesh() first.")
        
        return {
            'nodes': self.nodes,
            'elements': self.elements,
            'element_active': self.element_active,  # ✅ NEW: Include element_active status
            'boundary_nodes': self.boundary_nodes,
            'boundary_conditions': self.boundary_conditions,
            'num_nodes': len(self.nodes),
            'num_elements': len(self.elements)
        }
    
    def save_mesh_to_file(self, filename):
        """
        Save mesh data to file
        """
        if self.nodes is None or self.elements is None:
            raise ValueError("Mesh not generated yet. Call generate_mesh() first.")
        
        np.savez(filename, 
                 nodes=self.nodes, 
                 elements=self.elements, 
                 element_active=self.element_active,  # ✅ NEW: Save element_active status
                 boundary_nodes=self.boundary_nodes)
        print(f"Mesh saved to {filename}")
    
    def load_mesh_from_file(self, filename):
        """
        Load mesh data from file
        """
        data = np.load(filename)
        self.nodes = data['nodes']
        self.elements = data['elements']
        self.boundary_nodes = data['boundary_nodes']
        
        # ✅ NEW: Load element_active status (with fallback for old files)
        if 'element_active' in data:
            self.element_active = data['element_active']
        else:
            # Fallback: all elements active for old mesh files
            self.element_active = np.ones(len(self.elements), dtype=bool)
        
        print(f"Mesh loaded from {filename}")
        return self.get_mesh_data() 