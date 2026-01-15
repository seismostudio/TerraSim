"""
Visualization Module for Soil FEA Results
Displays mesh and contour plots for geotechnical analysis
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import tkinter as tk
from tkinter import ttk
import matplotlib.colors as mcolors

class FEAVisualizer:
    def __init__(self, geometry, solver_results):
        """
        Initialize FEA visualizer for soil analysis
        
        Parameters:
        geometry: Geometry object
        solver_results: Results from FEA solver
        """
        self.geometry = geometry
        self.solver_results = solver_results
        self.element_results = solver_results['element_results']
        self.nodal_displacements = solver_results['nodal_displacements']
        
        # Create main window with larger size
        self.root = tk.Tk()
        self.root.title("Soil FEA Analysis Results - CST Elements")
        self.root.geometry("1400x1000")  # Larger window
        
        # Create main container
        main_container = tk.Frame(self.root)
        main_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Create figure and canvas (smaller to leave room for controls)
        self.fig = Figure(figsize=(12, 7))
        self.canvas = FigureCanvasTkAgg(self.fig, main_container)
        self.canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        
        # Create control panel
        self.create_control_panel(main_container)
        
        # Initial plot - start with settlement contour
        self.plot_type = "settlement"
        self.update_plot()
        
        # Force window to front
        self.root.lift()
        self.root.attributes('-topmost', True)
        self.root.after_idle(self.root.attributes, '-topmost', False)
    
    def create_control_panel(self, parent):
        """Create control panel for plot options"""
        # Create control frame
        control_frame = tk.Frame(parent, bg='lightblue', relief='raised', bd=3)
        control_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=(10, 0))
        
        # Title for plot selection
        title_label = tk.Label(control_frame, text="SELECT PLOT TYPE:", 
                              font=("Arial", 14, "bold"), bg='lightblue', fg='darkblue')
        title_label.pack(side=tk.TOP, pady=(10, 5))
        
        # Create frame for radio buttons
        radio_frame = tk.Frame(control_frame, bg='lightblue')
        radio_frame.pack(side=tk.TOP, fill=tk.X, padx=20, pady=5)
        
        self.plot_var = tk.StringVar(value="settlement")
        plot_types = [
            ("🔲 Mesh", "mesh"),
            ("📊 Settlement", "settlement"),
            ("⚡ Effective Stress", "effective_stress"),
            ("🛡️ Safety Factor", "safety_factor"),
            ("📈 Major Principal Stress", "principal_1"),
            ("📉 Minor Principal Stress", "principal_3"),
            ("➡️ X-Stress (σx)", "stress_x"),
            ("⬆️ Y-Stress (σy)", "stress_y"),
            ("✂️ Shear Stress (τxy)", "stress_xy"),
            ("➡️ X-Strain (εx)", "strain_x"),
            ("⬆️ Y-Strain (εy)", "strain_y"),
            ("✂️ Shear Strain (γxy)", "strain_xy")
        ]
        
        # Create radio buttons in a grid layout
        row = 0
        col = 0
        max_cols = 4  # 4 buttons per row
        
        for text, value in plot_types:
            rb = tk.Radiobutton(radio_frame, text=text, variable=self.plot_var, 
                               value=value, command=self.update_plot,
                               font=("Arial", 11), bg='lightblue',
                               selectcolor='yellow', activebackground='lightgreen')
            rb.grid(row=row, column=col, padx=10, pady=3, sticky="w")
            
            col += 1
            if col >= max_cols:
                col = 0
                row += 1
        
        # Create bottom frame for additional controls
        bottom_frame = tk.Frame(control_frame, bg='lightblue')
        bottom_frame.pack(side=tk.TOP, fill=tk.X, pady=(10, 10), padx=20)
        
        # Current plot type indicator
        self.current_plot_label = tk.Label(bottom_frame, text="CURRENT: 📊 Settlement", 
                                          fg="darkgreen", font=("Arial", 12, "bold"),
                                          bg='lightblue', relief='solid', bd=2)
        self.current_plot_label.pack(side=tk.LEFT, padx=(0, 20))
        
        # Deformation scale
        tk.Label(bottom_frame, text="Deformation Scale:", 
                font=("Arial", 11), bg='lightblue').pack(side=tk.LEFT, padx=(0, 5))
        self.deform_scale = tk.DoubleVar(value=20.0)
        scale_entry = tk.Entry(bottom_frame, textvariable=self.deform_scale, width=8)
        scale_entry.pack(side=tk.LEFT, padx=5)
        tk.Button(bottom_frame, text="Apply", command=self.update_plot,
                 bg='lightgreen', font=("Arial", 10)).pack(side=tk.LEFT, padx=5)
        
        # Add prominent info label
        info_label = tk.Label(bottom_frame, 
                             text="💡 CLICK ANY RADIO BUTTON ABOVE TO CHANGE PLOT", 
                             fg="darkred", font=("Arial", 11, "bold"), bg='lightblue')
        info_label.pack(side=tk.RIGHT, padx=10)
    
    def update_plot(self):
        """Update the plot based on current settings"""
        self.fig.clear()
        
        plot_type = self.plot_var.get()
        
        # Update current plot label with emoji
        plot_names = {
            "mesh": "🔲 Mesh",
            "settlement": "📊 Settlement",
            "effective_stress": "⚡ Effective Stress",
            "safety_factor": "🛡️ Safety Factor",
            "principal_1": "📈 Major Principal Stress",
            "principal_3": "📉 Minor Principal Stress",
            "stress_x": "➡️ X-Stress",
            "stress_y": "⬆️ Y-Stress",
            "stress_xy": "✂️ Shear Stress",
            "strain_x": "➡️ X-Strain",
            "strain_y": "⬆️ Y-Strain",
            "strain_xy": "✂️ Shear Strain"
        }
        
        self.current_plot_label.config(text=f"CURRENT: {plot_names.get(plot_type, plot_type)}")
        
        if plot_type == "mesh":
            self.plot_mesh()
        elif plot_type == "settlement":
            self.plot_contour("settlement")
        elif plot_type == "effective_stress":
            self.plot_contour("effective_stress")
        elif plot_type == "safety_factor":
            self.plot_contour("safety_factor")
        elif plot_type == "principal_1":
            self.plot_contour("principal_1")
        elif plot_type == "principal_3":
            self.plot_contour("principal_3")
        elif plot_type.startswith("stress"):
            stress_type = plot_type.split("_")[1]
            self.plot_contour(f"stress_{stress_type}")
        elif plot_type.startswith("strain"):
            strain_type = plot_type.split("_")[1]
            self.plot_contour(f"strain_{strain_type}")
        
        self.canvas.draw()
    
    def plot_mesh(self):
        """Plot the undeformed mesh"""
        ax = self.fig.add_subplot(111)
        
        # Plot elements
        for elem_data in self.element_results:
            node_ids = elem_data['node_ids']
            nodes = self.geometry.nodes[node_ids]
            
            # Plot element edges
            for i in range(3):
                j = (i + 1) % 3
                ax.plot([nodes[i, 0], nodes[j, 0]], 
                       [nodes[i, 1], nodes[j, 1]], 'b-', linewidth=1.5)
        
        # Plot nodes
        ax.plot(self.geometry.nodes[:, 0], self.geometry.nodes[:, 1], 'ko', markersize=4)
        
        # Add node numbers
        for i, (x, y) in enumerate(self.geometry.nodes):
            ax.annotate(f'{i+1}', (x, y), xytext=(5, 5), textcoords='offset points', fontsize=8)
        
        ax.set_xlabel('X (m)')
        ax.set_ylabel('Y (m)')
        ax.set_title('Soil Mesh - CST Elements (Undeformed)')
        ax.grid(True, alpha=0.3)
        ax.set_aspect('equal')
    
    def plot_contour(self, contour_type):
        """Plot contour of specified quantity with improved post-processing"""
        ax = self.fig.add_subplot(111)
        
        # Prepare data for contour plotting - use both nodes and element centroids
        x_coords = []
        y_coords = []
        values = []
        
        # Add nodal values with proper averaging
        for i, node_coord in enumerate(self.geometry.nodes):
            x_coords.append(node_coord[0])
            y_coords.append(node_coord[1])
            
            # Get nodal value with proper averaging
            if contour_type == "settlement":
                disp = self.nodal_displacements[i]
                value = abs(disp['v'])  # Vertical displacement
            elif contour_type == "effective_stress":
                # Average of connected elements
                connected_elements = []
                for elem_data in self.element_results:
                    if i in elem_data['node_ids']:
                        connected_elements.append(elem_data['effective_stress'])
                value = np.mean(connected_elements) if connected_elements else 0
            elif contour_type == "safety_factor":
                connected_elements = []
                for elem_data in self.element_results:
                    if i in elem_data['node_ids']:
                        sf = elem_data['safety_factor']
                        if sf == float('inf'):
                            sf = 10.0  # Cap infinite values
                        connected_elements.append(sf)
                value = np.mean(connected_elements) if connected_elements else 1.0
            elif contour_type == "principal_1":
                connected_elements = []
                for elem_data in self.element_results:
                    if i in elem_data['node_ids']:
                        connected_elements.append(elem_data['principal_stresses'][0])
                value = np.mean(connected_elements) if connected_elements else 0
            elif contour_type == "principal_3":
                connected_elements = []
                for elem_data in self.element_results:
                    if i in elem_data['node_ids']:
                        connected_elements.append(elem_data['principal_stresses'][1])
                value = np.mean(connected_elements) if connected_elements else 0
            elif contour_type.startswith("stress"):
                stress_type = contour_type.split("_")[1]
                connected_elements = []
                for elem_data in self.element_results:
                    if i in elem_data['node_ids']:
                        if stress_type == "x":
                            connected_elements.append(elem_data['stresses'][0])
                        elif stress_type == "y":
                            connected_elements.append(elem_data['stresses'][1])
                        elif stress_type == "xy":
                            connected_elements.append(elem_data['stresses'][2])
                value = np.mean(connected_elements) if connected_elements else 0
            elif contour_type.startswith("strain"):
                strain_type = contour_type.split("_")[1]
                connected_elements = []
                for elem_data in self.element_results:
                    if i in elem_data['node_ids']:
                        if strain_type == "x":
                            connected_elements.append(elem_data['strains'][0])
                        elif strain_type == "y":
                            connected_elements.append(elem_data['strains'][1])
                        elif strain_type == "xy":
                            connected_elements.append(elem_data['strains'][2])
                value = np.mean(connected_elements) if connected_elements else 0
            else:
                value = 0
            
            values.append(value)
        
        # Add element centroid values for better interpolation
        for elem_data in self.element_results:
            node_ids = elem_data['node_ids']
            nodes = self.geometry.nodes[node_ids]
            
            # Get value for this element
            if contour_type == "settlement":
                # Average settlement at element nodes
                settlements = []
                for node_id in node_ids:
                    disp = self.nodal_displacements[node_id]
                    settlements.append(abs(disp['v']))  # Vertical displacement
                value = np.mean(settlements)
            elif contour_type == "effective_stress":
                value = elem_data['effective_stress']
            elif contour_type == "safety_factor":
                value = elem_data['safety_factor']
                if value == float('inf'):
                    value = 10.0  # Cap infinite values for plotting
            elif contour_type == "principal_1":
                value = elem_data['principal_stresses'][0]
            elif contour_type == "principal_3":
                value = elem_data['principal_stresses'][1]
            elif contour_type.startswith("stress"):
                stress_type = contour_type.split("_")[1]
                if stress_type == "x":
                    value = elem_data['stresses'][0]
                elif stress_type == "y":
                    value = elem_data['stresses'][1]
                elif stress_type == "xy":
                    value = elem_data['stresses'][2]
            elif contour_type.startswith("strain"):
                strain_type = contour_type.split("_")[1]
                if strain_type == "x":
                    value = elem_data['strains'][0]
                elif strain_type == "y":
                    value = elem_data['strains'][1]
                elif strain_type == "xy":
                    value = elem_data['strains'][2]
            
            # Add element centroid and value
            centroid_x = np.mean(nodes[:, 0])
            centroid_y = np.mean(nodes[:, 1])
            
            x_coords.append(centroid_x)
            y_coords.append(centroid_y)
            values.append(value)
        
        # Convert to numpy arrays
        x_coords = np.array(x_coords)
        y_coords = np.array(y_coords)
        values = np.array(values)
        
        # Remove any NaN or infinite values
        valid_mask = ~(np.isnan(values) | np.isinf(values))
        x_coords = x_coords[valid_mask]
        y_coords = y_coords[valid_mask]
        values = values[valid_mask]
        
        # Create regular grid for interpolation
        x_min, x_max = np.min(self.geometry.nodes[:, 0]), np.max(self.geometry.nodes[:, 0])
        y_min, y_max = np.min(self.geometry.nodes[:, 1]), np.max(self.geometry.nodes[:, 1])
        
        # Create denser grid for better contour (increase resolution)
        grid_resolution = 200  # Increased from 100
        xi = np.linspace(x_min, x_max, grid_resolution)
        yi = np.linspace(y_min, y_max, grid_resolution)
        Xi, Yi = np.meshgrid(xi, yi)
        
        # Interpolate values to grid using improved methods
        from scipy.interpolate import griddata, RBFInterpolator
        from scipy.ndimage import gaussian_filter
        from matplotlib.patches import Polygon
        from matplotlib.path import Path
        

        
        # Try RBF interpolation first for smoother results
        try:
            if len(x_coords) >= 3:  # Need at least 3 points for RBF
                # Normalize coordinates for better RBF performance
                x_norm = (x_coords - x_min) / (x_max - x_min)
                y_norm = (y_coords - y_min) / (y_max - y_min)
                coords_norm = np.column_stack([x_norm, y_norm])
                
                # Use RBF interpolation with thin plate spline
                rbf = RBFInterpolator(coords_norm, values, kernel='thin_plate_spline')
                
                # Normalize grid coordinates
                Xi_norm = (Xi - x_min) / (x_max - x_min)
                Yi_norm = (Yi - y_min) / (y_max - y_min)
                grid_norm = np.column_stack([Xi_norm.flatten(), Yi_norm.flatten()])
                
                # Interpolate
                Zi = rbf(grid_norm).reshape(Xi.shape)
                
                # Apply smoothing
                Zi = gaussian_filter(Zi, sigma=1.0)
                
            else:
                raise ValueError("Not enough points for RBF")
                
        except:
            # Fallback to griddata with cubic interpolation
            try:
                Zi = griddata((x_coords, y_coords), values, (Xi, Yi), method='cubic')
                
                # Fill NaN values with linear interpolation
                if np.any(np.isnan(Zi)):
                    Zi_linear = griddata((x_coords, y_coords), values, (Xi, Yi), method='linear')
                    Zi = np.where(np.isnan(Zi), Zi_linear, Zi)
                    
                    # Fill remaining NaN with nearest neighbor
                    if np.any(np.isnan(Zi)):
                        Zi_nn = griddata((x_coords, y_coords), values, (Xi, Yi), method='nearest')
                        Zi = np.where(np.isnan(Zi), Zi_nn, Zi)
                
                # Apply smoothing
                Zi = gaussian_filter(Zi, sigma=0.5)
                
            except:
                # Final fallback to nearest neighbor
                Zi = griddata((x_coords, y_coords), values, (Xi, Yi), method='nearest')
        
        # Handle remaining NaN values
        if np.any(np.isnan(Zi)):
            Zi = np.nan_to_num(Zi, nan=np.nanmean(values))
        
        
        # Choose appropriate colormap and levels based on data range
        v_min, v_max = np.nanmin(values), np.nanmax(values)
        
        if contour_type == "safety_factor":
            cmap = 'RdYlGn_r'  # Red-Yellow-Green reversed (red=low, green=high)
            # Better level selection for safety factor
            if v_max > 5.0:
                levels = np.linspace(0.1, 5.0, 25)
            else:
                levels = np.linspace(v_min, v_max, 25)
        elif contour_type == "settlement":
            cmap = 'viridis'
            levels = np.linspace(v_min, v_max, 25)
        elif contour_type in ["effective_stress", "principal_1", "principal_3"]:
            cmap = 'plasma'
            levels = np.linspace(v_min, v_max, 25)
        elif contour_type.startswith("stress"):
            cmap = 'RdBu_r'  # Red-Blue reversed for stresses
            levels = np.linspace(v_min, v_max, 25)
        elif contour_type.startswith("strain"):
            cmap = 'coolwarm'  # Cool-Warm for strains
            levels = np.linspace(v_min, v_max, 25)
        else:
            cmap = 'viridis'
            levels = np.linspace(v_min, v_max, 25)
        
        # Plot contour with filled areas and clipping
        contour = ax.contourf(Xi, Yi, Zi, levels=levels, cmap=cmap, extend='both', alpha=0.8)
        
        # Add contour lines for better visualization with clipping
        contour_lines = ax.contour(Xi, Yi, Zi, levels=levels, colors='black', alpha=0.4, linewidths=0.8)
        
        # Add colorbar with proper formatting
        cbar = self.fig.colorbar(contour, ax=ax, shrink=0.8, aspect=20)
        
        # Format colorbar labels
        if contour_type == "settlement":
            cbar.set_label('Settlement (m)', fontsize=12)
        elif contour_type == "effective_stress":
            cbar.set_label('Effective Stress (kN/m²)', fontsize=12)
        elif contour_type == "safety_factor":
            cbar.set_label('Safety Factor', fontsize=12)
        elif contour_type == "principal_1":
            cbar.set_label('Major Principal Stress (kN/m²)', fontsize=12)
        elif contour_type == "principal_3":
            cbar.set_label('Minor Principal Stress (kN/m²)', fontsize=12)
        elif contour_type.startswith("stress"):
            stress_type = contour_type.split("_")[1]
            cbar.set_label(f'{stress_type.upper()}-Stress (kN/m²)', fontsize=12)
        elif contour_type.startswith("strain"):
            strain_type = contour_type.split("_")[1]
            cbar.set_label(f'{strain_type.upper()}-Strain', fontsize=12)
        
        # Plot deformed mesh overlay
        deformation_scale = self.deform_scale.get()
        
        # Plot deformed mesh
        for elem_data in self.element_results:
            node_ids = elem_data['node_ids']
            nodes = self.geometry.nodes[node_ids]
            
            # Get deformed coordinates
            deformed_nodes = []
            for i, node_id in enumerate(node_ids):
                disp = self.nodal_displacements[node_id]
                deformed_x = nodes[i, 0] + disp['u'] * deformation_scale
                deformed_y = nodes[i, 1] + disp['v'] * deformation_scale
                deformed_nodes.append([deformed_x, deformed_y])
            
            deformed_nodes = np.array(deformed_nodes)
            
            # Plot deformed element edges
            for i in range(3):
                j = (i + 1) % 3
                ax.plot([deformed_nodes[i, 0], deformed_nodes[j, 0]], 
                       [deformed_nodes[i, 1], deformed_nodes[j, 1]], 
                       'r-', linewidth=1.5, alpha=0.8)
        
        # Plot deformed nodes
        deformed_node_x = []
        deformed_node_y = []
        for i, node_coord in enumerate(self.geometry.nodes):
            disp = self.nodal_displacements[i]
            deformed_x = node_coord[0] + disp['u'] * deformation_scale
            deformed_y = node_coord[1] + disp['v'] * deformation_scale
            deformed_node_x.append(deformed_x)
            deformed_node_y.append(deformed_y)
        
        ax.plot(deformed_node_x, deformed_node_y, 'ro', markersize=4, alpha=0.8)
        
        # Plot original mesh for comparison (thin lines)
        for elem_data in self.element_results:
            node_ids = elem_data['node_ids']
            nodes = self.geometry.nodes[node_ids]
            
            for i in range(3):
                j = (i + 1) % 3
                ax.plot([nodes[i, 0], nodes[j, 0]], 
                       [nodes[i, 1], nodes[j, 1]], 
                       'k--', linewidth=0.5, alpha=0.3)
        
        # Plot original nodes
        ax.plot(self.geometry.nodes[:, 0], self.geometry.nodes[:, 1], 'ko', markersize=2, alpha=0.5)
        
        # Set labels and title
        ax.set_xlabel('X (m)', fontsize=12)
        ax.set_ylabel('Y (m)', fontsize=12)
        
        titles = {
            "settlement": "Settlement (m) - Deformed Mesh",
            "effective_stress": "Effective Stress (kN/m²) - Deformed Mesh",
            "safety_factor": "Safety Factor - Deformed Mesh",
            "principal_1": "Major Principal Stress σ₁ (kN/m²) - Deformed Mesh",
            "principal_3": "Minor Principal Stress σ₃ (kN/m²) - Deformed Mesh",
            "stress_x": "X-Stress σx (kN/m²) - Deformed Mesh",
            "stress_y": "Y-Stress σy (kN/m²) - Deformed Mesh",
            "stress_xy": "Shear Stress τxy (kN/m²) - Deformed Mesh",
            "strain_x": "X-Strain εx - Deformed Mesh",
            "strain_y": "Y-Strain εy - Deformed Mesh",
            "strain_xy": "Shear Strain γxy - Deformed Mesh"
        }
        
        ax.set_title(titles.get(contour_type, contour_type), fontsize=14, fontweight='bold')
        ax.set_aspect('equal')
        
        # Set axis limits to cover full domain
        ax.set_xlim(x_min, x_max)
        ax.set_ylim(y_min, y_max)
        
        # Add legend
        from matplotlib.patches import Patch
        legend_elements = [
            Patch(facecolor='red', alpha=0.8, label='Deformed Mesh'),
            Patch(facecolor='black', alpha=0.3, label='Original Mesh')
        ]
        ax.legend(handles=legend_elements, loc='upper right', fontsize=10)
        
        # Add grid for better reference
        ax.grid(True, alpha=0.2, linestyle='-', linewidth=0.5)
    
    def run(self):
        """Start the visualization window"""
        self.root.mainloop() 