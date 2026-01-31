import DxfParser from 'dxf-parser';
import { PolygonData } from '../types';

export const parseDXF = async (file: File): Promise<PolygonData[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const fileText = e.target?.result as string;
            if (!fileText) {
                reject(new Error("Empty file"));
                return;
            }

            try {
                const parser = new DxfParser();
                const dxf = parser.parseSync(fileText);

                if (!dxf || !dxf.entities) {
                    reject(new Error("Invalid DXF or no entities found"));
                    return;
                }

                console.log("Parsed DXF:", dxf);

                const polygons: PolygonData[] = [];
                let regionCount = 0;
                let polylineCount = 0;

                const processEntity = (entity: any) => {
                    console.log("Processing entity:", entity.type, entity);

                    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
                        let isClosed = (entity.shape === true) || (entity.closed === true) || ((entity.flag & 1) === 1);

                        // Relaxed check: valid vertices
                        if (!entity.vertices || entity.vertices.length < 2) return;

                        const vertices = entity.vertices.map((v: any) => ({ x: v.x, y: v.y }));

                        // Check if start/end match (manual close)
                        const first = vertices[0];
                        const last = vertices[vertices.length - 1];
                        if (!isClosed && Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
                            isClosed = true;
                        }

                        // Relaxed: Import if it has enough vertices, even if not marked closed.
                        if (vertices.length >= 3) {
                            polygons.push({
                                vertices: vertices,
                                materialId: 'default',
                            });
                            polylineCount++;
                        }
                    } else if (entity.type === 'REGION') {
                        regionCount++;
                        console.warn("Found REGION entity.", entity);
                        // Try to extract vertices if available
                        if (entity.vertices) {
                            const vertices = entity.vertices.map((v: any) => ({ x: v.x, y: v.y }));
                            polygons.push({
                                vertices: vertices,
                                materialId: 'default'
                            });
                        }
                    } else if (entity.type === 'INSERT') {
                        console.log("Found INSERT (Block Reference). Name:", entity.name);
                    }
                };

                if (dxf.entities) {
                    dxf.entities.forEach(processEntity);
                }

                console.log(`Summary: ${polygons.length} polygons extracted from ${dxf.entities ? dxf.entities.length : 0} entities.`);

                if (polygons.length === 0 && regionCount > 0) {
                    console.warn("Found Regions but could not extract geometry. Suggest converting to Polylines.");
                }

                resolve(polygons);
            } catch (err) {
                console.error("DXF Parse Error", err);
                reject(err);
            }
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
};
