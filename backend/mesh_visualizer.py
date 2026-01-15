"""
Mesh Visualization Module
Provides visualization tools for the generated mesh
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import Polygon as MplPolygon
import matplotlib.tri as tri

class MeshVisualizer:
    def __init__(self, mesh_generator):
        """
        Initialize mesh visualizer
        
        Args:
            mesh_generator: MeshGenerator object with generated mesh data
        """
        self.mesh_generator = mesh_generator
        self.polygon = mesh_generator.polygon
        
    def plot_polygon_boundary(self, ax=None, show_vertices=True, show_segments=True):
        """
        Plot the original polygon boundary
        
        Args:
            ax: matplotlib axis (if None, creates new figure)
            show_vertices: whether to show vertex points
            show_segments: whether to show boundary segments
        """
        if ax is None:
            fig, ax = plt.subplots(figsize=(10, 8))
        
        vertices = self.polygon.vertices
        
        # Plot outer boundary
        outer_vertices = vertices[:6]
        outer_polygon = MplPolygon(outer_vertices, facecolor='none', 
                                  edgecolor='blue', linewidth=2, label='Outer Boundary')
        ax.add_patch(outer_polygon)
        
        # Plot inner boundary (hole)
        inner_vertices = vertices[6:10]
        inner_polygon = MplPolygon(inner_vertices, facecolor='none', 
                                  edgecolor='red', linewidth=2, label='Inner Boundary (Hole)')
        ax.add_patch(inner_polygon)
        
        # Plot vertices
        if show_vertices:
            ax.plot(vertices[:, 0], vertices[:, 1], 'ko', markersize=6, label='Vertices')
        
        # Plot boundary segments
        if show_segments:
            for i, segment in enumerate(self.polygon.boundary_segments):
                start_vertex = vertices[segment[0]]
                end_vertex = vertices[segment[1]]
                color = 'blue' if self.polygon.boundary_types[i] == 0 else 'red'
                ax.plot([start_vertex[0], end_vertex[0]], 
                       [start_vertex[1], end_vertex[1]], 
                       color=color, linewidth=1, alpha=0.7)
        
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title('Polygon Boundary')
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.set_aspect('equal')
        
        return ax
    
    def plot_mesh(self, ax=None, show_nodes=True, show_elements=True, 
                  show_boundary_nodes=False, element_colors=None):
        """
        Plot the generated mesh
        
        Args:
            ax: matplotlib axis (if None, creates new figure)
            show_nodes: whether to show all nodes
            show_elements: whether to show triangular elements
            show_boundary_nodes: whether to highlight boundary nodes
            element_colors: array of colors for elements (optional)
        """
        if self.mesh_generator.nodes is None:
            raise ValueError("Mesh not generated yet. Call generate_mesh() first.")
        
        if ax is None:
            fig, ax = plt.subplots(figsize=(12, 10))
        
        nodes = self.mesh_generator.nodes
        elements = self.mesh_generator.elements
        boundary_nodes = self.mesh_generator.boundary_nodes
        
        # Plot triangular elements
        if show_elements:
            if element_colors is None:
                # Create triangulation for plotting
                triangulation = tri.Triangulation(nodes[:, 0], nodes[:, 1], elements)
                ax.triplot(triangulation, 'b-', linewidth=0.5, alpha=0.7)
            else:
                # Plot elements with custom colors
                for i, element in enumerate(elements):
                    triangle_points = nodes[element]
                    triangle = MplPolygon(triangle_points, facecolor=element_colors[i], 
                                        edgecolor='black', linewidth=0.5, alpha=0.7)
                    ax.add_patch(triangle)
        
        # Plot all nodes
        if show_nodes:
            ax.plot(nodes[:, 0], nodes[:, 1], 'ko', markersize=2, alpha=0.6, label='Nodes')
        
        # Highlight boundary nodes
        if show_boundary_nodes and boundary_nodes:
            boundary_coords = nodes[boundary_nodes]
            ax.plot(boundary_coords[:, 0], boundary_coords[:, 1], 'ro', 
                   markersize=4, label='Boundary Nodes')
        
        # Plot original polygon boundary for reference
        self.plot_polygon_boundary(ax, show_vertices=False, show_segments=False)
        
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(f'Generated Mesh (Nodes: {len(nodes)}, Elements: {len(elements)})')
        ax.legend()
        ax.grid(True, alpha=0.3)
        ax.set_aspect('equal')
        
        return ax
    
    def plot_mesh_quality(self, ax=None):
        """
        Plot mesh quality metrics (element aspect ratios)
        
        Args:
            ax: matplotlib axis (if None, creates new figure)
        """
        if self.mesh_generator.nodes is None:
            raise ValueError("Mesh not generated yet. Call generate_mesh() first.")
        
        if ax is None:
            fig, ax = plt.subplots(figsize=(12, 10))
        
        nodes = self.mesh_generator.nodes
        elements = self.mesh_generator.elements
        
        # Calculate aspect ratios for each element
        aspect_ratios = []
        for element in elements:
            triangle_points = nodes[element]
            aspect_ratio = self._calculate_aspect_ratio(triangle_points)
            aspect_ratios.append(aspect_ratio)
        
        aspect_ratios = np.array(aspect_ratios)
        
        # Create color map based on aspect ratio quality
        # Good triangles have aspect ratio close to 1.0
        quality_colors = plt.cm.viridis(1 - np.clip(aspect_ratios / np.max(aspect_ratios), 0, 1))
        
        # Plot elements with quality colors
        for i, element in enumerate(elements):
            triangle_points = nodes[element]
            triangle = MplPolygon(triangle_points, facecolor=quality_colors[i], 
                                edgecolor='black', linewidth=0.5, alpha=0.8)
            ax.add_patch(triangle)
        
        # Add colorbar
        sm = plt.cm.ScalarMappable(cmap=plt.cm.viridis, 
                                  norm=plt.Normalize(vmin=np.min(aspect_ratios), 
                                                   vmax=np.max(aspect_ratios)))
        sm.set_array([])
        cbar = plt.colorbar(sm, ax=ax)
        cbar.set_label('Aspect Ratio (Lower is Better)')
        
        # Plot original polygon boundary
        self.plot_polygon_boundary(ax, show_vertices=False, show_segments=False)
        
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title(f'Mesh Quality (Avg Aspect Ratio: {np.mean(aspect_ratios):.3f})')
        ax.grid(True, alpha=0.3)
        ax.set_aspect('equal')
        
        return ax
    
    def _calculate_aspect_ratio(self, triangle_points):
        """
        Calculate aspect ratio of a triangle
        Aspect ratio = longest edge / shortest edge
        """
        # Calculate edge lengths
        edges = []
        for i in range(3):
            p1 = triangle_points[i]
            p2 = triangle_points[(i + 1) % 3]
            edge_length = np.linalg.norm(p2 - p1)
            edges.append(edge_length)
        
        edges = np.array(edges)
        return np.max(edges) / np.min(edges)
    
    def plot_mesh_statistics(self):
        """
        Create a comprehensive mesh statistics plot
        """
        if self.mesh_generator.nodes is None:
            raise ValueError("Mesh not generated yet. Call generate_mesh() first.")
        
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
        
        # Plot 1: Original polygon
        self.plot_polygon_boundary(ax1)
        ax1.set_title('Original Polygon')
        
        # Plot 2: Generated mesh
        self.plot_mesh(ax2, show_nodes=True, show_elements=True, show_boundary_nodes=True)
        ax2.set_title('Generated Mesh')
        
        # Plot 3: Mesh quality
        self.plot_mesh_quality(ax3)
        ax3.set_title('Mesh Quality')
        
        # Plot 4: Mesh statistics
        self._plot_mesh_statistics_panel(ax4)
        ax4.set_title('Mesh Statistics')
        
        plt.tight_layout()
        return fig
    
    def _plot_mesh_statistics_panel(self, ax):
        """
        Plot mesh statistics in a text panel
        """
        nodes = self.mesh_generator.nodes
        elements = self.mesh_generator.elements
        boundary_nodes = self.mesh_generator.boundary_nodes
        
        # Calculate statistics
        total_nodes = len(nodes)
        total_elements = len(elements)
        boundary_node_count = len(boundary_nodes)
        interior_node_count = total_nodes - boundary_node_count
        
        # Calculate element quality
        aspect_ratios = []
        areas = []
        for element in elements:
            triangle_points = nodes[element]
            aspect_ratio = self._calculate_aspect_ratio(triangle_points)
            area = self._calculate_triangle_area(triangle_points)
            aspect_ratios.append(aspect_ratio)
            areas.append(area)
        
        aspect_ratios = np.array(aspect_ratios)
        areas = np.array(areas)
        
        # Create statistics text
        stats_text = f"""
Mesh Statistics:
================

Nodes:
- Total: {total_nodes}
- Boundary: {boundary_node_count}
- Interior: {interior_node_count}

Elements:
- Total: {total_elements}
- Average area: {np.mean(areas):.4f} m²
- Min area: {np.min(areas):.4f} m²
- Max area: {np.max(areas):.4f} m²

Quality:
- Avg aspect ratio: {np.mean(aspect_ratios):.3f}
- Min aspect ratio: {np.min(aspect_ratios):.3f}
- Max aspect ratio: {np.max(aspect_ratios):.3f}

Mesh Parameters:
- Target mesh size: {self.polygon.mesh_size} m
- Boundary refinement: {self.polygon.boundary_refinement_factor}
        """
        
        ax.text(0.05, 0.95, stats_text, transform=ax.transAxes, 
                fontsize=10, verticalalignment='top', 
                bbox=dict(boxstyle='round', facecolor='lightblue', alpha=0.8))
        
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')
    
    def _calculate_triangle_area(self, triangle_points):
        """
        Calculate area of a triangle using shoelace formula
        """
        x = triangle_points[:, 0]
        y = triangle_points[:, 1]
        return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    
    def save_mesh_plot(self, filename, plot_type='mesh'):
        """
        Save mesh plot to file
        
        Args:
            filename: output filename
            plot_type: 'mesh', 'quality', 'statistics', or 'boundary'
        """
        if plot_type == 'mesh':
            fig, ax = plt.subplots(figsize=(12, 10))
            self.plot_mesh(ax)
        elif plot_type == 'quality':
            fig, ax = plt.subplots(figsize=(12, 10))
            self.plot_mesh_quality(ax)
        elif plot_type == 'statistics':
            fig = self.plot_mesh_statistics()
        elif plot_type == 'boundary':
            fig, ax = plt.subplots(figsize=(10, 8))
            self.plot_polygon_boundary(ax)
        else:
            raise ValueError("plot_type must be 'mesh', 'quality', 'statistics', or 'boundary'")
        
        plt.savefig(filename, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"Plot saved to {filename}")
    
    def show_interactive_mesh(self):
        """
        Show interactive mesh plot
        """
        if self.mesh_generator.nodes is None:
            raise ValueError("Mesh not generated yet. Call generate_mesh() first.")
        
        fig = self.plot_mesh_statistics()
        plt.show()
        return fig 