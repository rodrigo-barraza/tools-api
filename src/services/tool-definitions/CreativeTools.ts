// ────────────────────────────────────────────────────────────
// Tool Definitions — Creative
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { cached, onDemand, compute } from "./utils.ts";
import {
  EMOJI_KITCHEN_INTERVAL_MS
} from "../../constants.ts";

export function getCreativeTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "generate_qr_code",
    dataSource: compute("qrcode"),
    description: translate("generate_qr_code.description"),
    endpoint: {
      method: "POST",
      path: "/compute/qr",
      bodyParams: [
        "data",
        "size",
        "errorCorrection",
        "darkColor",
        "lightColor",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("generate_qr_code.params.data"),
        },
        size: {
          type: "integer",
          description: translate("generate_qr_code.params.size"),
        },
        errorCorrection: {
          type: "string",
          enum: ["L", "M", "Q", "H"],
          description: translate("generate_qr_code.params.errorCorrection"),
        },
        darkColor: {
          type: "string",
          description: translate("generate_qr_code.params.darkColor"),
        },
        lightColor: {
          type: "string",
          description: translate("generate_qr_code.params.lightColor"),
        },
      },
      required: ["data"],
    },
    display: {
      activeVerb: "Generating QR code for",
      completedVerb: "Generated QR code for",
      subjectParam: "data",
      subjectFormat: "truncate",
    },
  },
  {
    name: "convert_color",
    dataSource: compute("internal"),
    description: translate("convert_color.description"),
    endpoint: {
      path: "/compute/color/convert",
      queryParams: ["color", "palette"],
    },
    parameters: {
      type: "object",
      properties: {
        color: {
          type: "string",
          description: translate("convert_color.params.color"),
        },
        palette: {
          type: "string",
          enum: [
            "complementary",
            "analogous",
            "triadic",
            "splitComplementary",
            "tetradic",
            "monochromatic",
          ],
          description: translate("convert_color.params.palette"),
        },
      },
      required: ["color"],
    },
    display: {
      activeVerb: "Converting color values",
      completedVerb: "Converted color values",
      subjectParam: "color",
      subjectFormat: "quoted",
    },
  },
  {
    name: "manipulate_image",
    dataSource: compute("sharp + imagemagick"),
    description: translate("manipulate_image.description"),
    endpoint: {
      method: "POST",
      path: "/compute/image/process",
      bodyParams: ["input", "operations", "outputFormat", "outputQuality"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("manipulate_image.params.input"),
        },
        operations: {
          type: "array",
          description: translate("manipulate_image.params.operations"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "resize",
                  "crop",
                  "rotate",
                  "flip",
                  "blur",
                  "sharpen",
                  "grayscale",
                  "negate",
                  "tint",
                  "adjust",
                  "gamma",
                  "trim",
                  "extend",
                  "composite",
                  "metadata",
                  "text",
                  "distort",
                  "border",
                ],
                description: translate("manipulate_image.params.operations.items.params.type"),
              },
              width: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.width"),
              },
              height: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.height"),
              },
              fit: {
                type: "string",
                enum: ["cover", "contain", "fill", "inside", "outside"],
                description: translate("manipulate_image.params.operations.items.params.fit"),
              },
              left: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.left"),
              },
              top: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.top"),
              },
              right: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.right"),
              },
              bottom: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.bottom"),
              },
              angle: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.angle"),
              },
              direction: {
                type: "string",
                enum: ["horizontal", "vertical"],
                description: translate("manipulate_image.params.operations.items.params.direction"),
              },
              sigma: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.sigma"),
              },
              color: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.color"),
              },
              background: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.background"),
              },
              brightness: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.brightness"),
              },
              saturation: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.saturation"),
              },
              hue: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.hue"),
              },
              value: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.value"),
              },
              threshold: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.threshold"),
              },
              overlayUrl: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.overlayUrl"),
              },
              gravity: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.gravity"),
              },
              blend: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.blend"),
              },
              content: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.content"),
              },
              font: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.font"),
              },
              fontSize: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.fontSize"),
              },
              strokeColor: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.strokeColor"),
              },
              strokeWidth: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.strokeWidth"),
              },
              x: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.x"),
              },
              y: {
                type: "integer",
                description: translate("manipulate_image.params.operations.items.params.y"),
              },
              effect: {
                type: "string",
                enum: ["swirl", "wave", "implode", "barrel"],
                description: translate("manipulate_image.params.operations.items.params.effect"),
              },
              degrees: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.degrees"),
              },
              amplitude: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.amplitude"),
              },
              wavelength: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.wavelength"),
              },
              factor: {
                type: "number",
                description: translate("manipulate_image.params.operations.items.params.factor"),
              },
              params: {
                type: "string",
                description: translate("manipulate_image.params.operations.items.params.params"),
              },
            },
            required: ["type"],
          },
        },
        outputFormat: {
          type: "string",
          enum: ["png", "jpeg", "webp", "avif", "tiff"],
          description: translate("manipulate_image.params.outputFormat"),
        },
        outputQuality: {
          type: "integer",
          description: translate("manipulate_image.params.outputQuality"),
        },
      },
      required: ["input", "operations"],
    },
    display: {
      activeVerb: "Processing image",
      completedVerb: "Processed image",
      subjectParam: "input",
      subjectFormat: "basename",
      filePathParam: "input",
    },
  },
  {
    name: "convert_image_to_ascii",
    dataSource: compute("sharp"),
    description: translate("convert_image_to_ascii.description"),
    endpoint: {
      method: "POST",
      path: "/compute/image/ascii",
      bodyParams: ["input", "width", "chars", "contrast", "reverse"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("convert_image_to_ascii.params.input"),
        },
        width: {
          type: "integer",
          description: translate("convert_image_to_ascii.params.width"),
        },
        chars: {
          type: "string",
          description: translate("convert_image_to_ascii.params.chars"),
        },
        contrast: {
          type: "number",
          description: translate("convert_image_to_ascii.params.contrast"),
        },
        reverse: {
          type: "boolean",
          description: translate("convert_image_to_ascii.params.reverse"),
        },
      },
      required: ["input"],
    },
    display: {
      activeVerb: "Converting image to ASCII",
      completedVerb: "Converted image to ASCII",
      subjectParam: "input",
      subjectFormat: "basename",
      filePathParam: "input",
    },
  },
  {
    name: "draw_turtle_graphics",
    dataSource: compute("LOGO interpreter"),
    description: translate("draw_turtle_graphics.description"),
    endpoint: {
      method: "POST",
      path: "/compute/turtle",
      bodyParams: ["code", "drawingId", "width", "height"],
    },
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: translate("draw_turtle_graphics.params.code"),
        },
        drawingId: {
          type: "string",
          description: translate("draw_turtle_graphics.params.drawingId"),
        },
        width: {
          type: "number",
          description: translate("draw_turtle_graphics.params.width"),
        },
        height: {
          type: "number",
          description: translate("draw_turtle_graphics.params.height"),
        },
      },
      required: ["code"],
    },
    display: {
      activeVerb: "Drawing turtle graphics",
      completedVerb: "Drew turtle graphics",
      subjectParam: "code",
      subjectFormat: "truncate",
    },
  },
  {
    name: "create_3d_mesh",
    dataSource: compute("internal"),
    description: translate("create_3d_mesh.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/mesh",
      bodyParams: [
        "vertices",
        "faces",
        "normals",
        "colors",
        "options",
        "sessionId",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_mesh.params.sessionId"),
        },
        vertices: {
          type: "array",
          description: translate("create_3d_mesh.params.vertices"),
          items: {
            type: "array",
            items: { type: "number" },
            description: translate("create_3d_mesh.params.items"),
          },
        },
        faces: {
          type: "array",
          description: translate("create_3d_mesh.params.faces"),
          items: {
            type: "array",
            items: { type: "integer" },
            description: translate("create_3d_mesh.params.items2"),
          },
        },
        normals: {
          type: "array",
          description: translate("create_3d_mesh.params.normals"),
          items: {
            type: "array",
            items: { type: "number" },
          },
        },
        colors: {
          type: "array",
          description: translate("create_3d_mesh.params.colors"),
          items: { type: "string" },
        },
        options: {
          type: "object",
          properties: {
            wireframe: {
              type: "boolean",
              description: translate("create_3d_mesh.params.options.params.wireframe"),
            },
            flatShading: {
              type: "boolean",
              description: translate("create_3d_mesh.params.options.params.flatShading"),
            },
            autoRotate: {
              type: "boolean",
              description: translate("create_3d_mesh.params.options.params.autoRotate"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showGrid"),
            },
            showAxes: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showAxes"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            meshColor: {
              type: "string",
              description: translate("create_3d_mesh.params.options.params.meshColor"),
            },
            metalness: {
              type: "number",
              description: translate("create_3d_mesh.params.options.params.metalness"),
            },
            roughness: {
              type: "number",
              description: translate("create_3d_mesh.params.options.params.roughness"),
            },
            opacity: {
              type: "number",
              description: translate("create_3d_mesh.params.options.params.opacity"),
            },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: translate("create_3d_voxel.params.options.params.cameraPosition"),
            },
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
          },
          description: translate("create_3d_voxel.params.options"),
        },
      },
      required: ["vertices", "faces"],
    },
    display: {
      activeVerb: "Creating 3D mesh model",
      completedVerb: "Created 3D mesh model",
      subjectParam: "sessionId",
      subjectFormat: "full",
    },
  },
  {
    name: "create_3d_voxel",
    dataSource: compute("internal"),
    description: translate("create_3d_voxel.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/voxel",
      bodyParams: ["voxels", "shapes", "options", "sessionId"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_voxel.params.sessionId"),
        },
        voxels: {
          type: "array",
          description: translate("create_3d_voxel.params.voxels"),
          items: {
            type: "object",
            properties: {
              position: {
                type: "array",
                description: translate("create_3d_voxel.params.voxels.items.params.position"),
                items: { type: "integer" },
              },
              color: {
                type: "string",
                description: translate("create_3d_voxel.params.voxels.items.params.color"),
              },
              opacity: {
                type: "number",
                description: translate("create_3d_voxel.params.voxels.items.params.opacity"),
              },
            },
            required: ["position"],
          },
        },
        shapes: {
          type: "array",
          description: translate("create_3d_voxel.params.shapes"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "box",
                  "sphere",
                  "cylinder",
                  "cone",
                  "pyramid",
                  "ellipsoid",
                  "torus",
                ],
                description: translate("create_3d_voxel.params.shapes.items.params.type"),
              },
              center: {
                type: "array",
                description: translate("create_3d_voxel.params.shapes.items.params.center"),
                items: { type: "number" },
              },
              color: {
                type: "string",
                description: translate("create_3d_voxel.params.shapes.items.params.color"),
              },
              opacity: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.opacity"),
              },
              hollow: {
                type: "boolean",
                description: translate("create_3d_voxel.params.shapes.items.params.hollow"),
              },
              size: {
                type: "array",
                description: translate("create_3d_voxel.params.shapes.items.params.size"),
                items: { type: "number" },
              },
              radius: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.radius"),
              },
              height: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.height"),
              },
              radii: {
                type: "array",
                description: translate("create_3d_voxel.params.shapes.items.params.radii"),
                items: { type: "number" },
              },
              majorRadius: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.majorRadius"),
              },
              minorRadius: {
                type: "number",
                description: translate("create_3d_voxel.params.shapes.items.params.minorRadius"),
              },
              axis: {
                type: "string",
                enum: ["x", "y", "z"],
                description: translate("create_3d_voxel.params.shapes.items.params.axis"),
              },
            },
            required: ["type", "center"],
          },
        },
        options: {
          type: "object",
          properties: {
            wireframe: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.wireframe"),
            },
            flatShading: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.flatShading"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showGrid"),
            },
            showAxes: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showAxes"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            autoRotate: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.autoRotate"),
            },
            autoRotateSpeed: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.autoRotateSpeed"),
            },
            voxelSize: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.voxelSize"),
            },
            voxelSpacing: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.voxelSpacing"),
            },
            outlineColor: {
              type: "string",
              description: translate("create_3d_voxel.params.options.params.outlineColor"),
            },
            outlineOpacity: {
              type: "number",
              description: translate("create_3d_voxel.params.options.params.outlineOpacity"),
            },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: translate("create_3d_voxel.params.options.params.cameraPosition"),
            },
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
          },
          description: translate("create_3d_voxel.params.options"),
        },
      },
    },
    display: {
      activeVerb: "Creating 3D voxel model",
      completedVerb: "Created 3D voxel model",
      subjectParam: "sessionId",
      subjectFormat: "full",
    },
  },
  {
    name: "create_3d_model",
    dataSource: compute("internal"),
    description: translate("create_3d_model.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/model",
      bodyParams: ["objects", "options", "sessionId", "referenceTextureUrl"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_model.params.sessionId"),
        },
        objects: {
          type: "array",
          description: translate("create_3d_model.params.objects"),
          items: {
            type: "object",
            properties: {
              shape: {
                type: "string",
                enum: [
                  "box",
                  "sphere",
                  "cylinder",
                  "cone",
                  "torus",
                  "torusKnot",
                  "plane",
                  "ring",
                  "circle",
                  "dodecahedron",
                  "icosahedron",
                  "octahedron",
                  "tetrahedron",
                  "capsule",
                ],
                description: translate("create_3d_voxel.params.shapes.items.params.type"),
              },
              size: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.size"),
              },
              radius: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.radius"),
              },
              height: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.height"),
              },
              radiusTop: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.radiusTop"),
              },
              radiusBottom: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.radiusBottom"),
              },
              tube: {
                type: "number",
                description: translate("create_3d_model.params.objects.items.params.tube"),
              },
              segments: {
                type: "integer",
                description: translate("create_3d_model.params.objects.items.params.segments"),
              },
              position: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.position"),
              },
              rotation: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.rotation"),
              },
              scale: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_model.params.objects.items.params.scale"),
              },
              material: {
                type: "object",
                properties: {
                  color: {
                    type: "string",
                    description: translate("create_3d_model.params.objects.items.params.material.params.color"),
                  },
                  metalness: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.metalness"),
                  },
                  roughness: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.roughness"),
                  },
                  opacity: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.opacity"),
                  },
                  emissive: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.emissive"),
                  },
                  emissiveIntensity: {
                    type: "number",
                    description: translate("create_3d_model.params.objects.items.params.material.params.emissiveIntensity"),
                  },
                  wireframe: { type: "boolean", description: translate("create_3d_model.params.wireframe") },
                  flatShading: { type: "boolean", description: translate("create_3d_model.params.flatShading") },
                  doubleSided: {
                    type: "boolean",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.doubleSided"),
                  },
                  textureUrl: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.textureUrl"),
                  },
                },
                description: translate("create_3d_model.params.objects.items.params.material"),
              },
              name: {
                type: "string",
                description: translate("create_3d_model.params.objects.items.params.name"),
              },
            },
            required: ["shape"],
          },
        },
        options: {
          type: "object",
          properties: {
            autoRotate: {
              type: "boolean",
              description: translate("create_3d_scene.params.scene.params.camera.params.autoOrbit"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_voxel.params.options.params.showGrid"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            enableShadows: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.enableShadows"),
            },
            ambientLightIntensity: {
              type: "number",
              description: translate("create_3d_model.params.options.params.ambientLightIntensity"),
            },
            directionalLightIntensity: {
              type: "number",
              description: translate("create_3d_model.params.options.params.directionalLightIntensity"),
            },
            cameraPosition: {
              type: "array",
              items: { type: "number" },
              description: translate("create_3d_voxel.params.options.params.cameraPosition"),
            },
            fieldOfView: {
              type: "number",
              description: translate("create_3d_model.params.options.params.fieldOfView"),
            },
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
          },
          description: translate("create_3d_model.params.options"),
        },
      },
      required: ["objects"],
    },
    display: {
      activeVerb: "Creating 3D model",
      completedVerb: "Created 3D model",
      subjectParam: "sessionId",
      subjectFormat: "full",
    },
  },
  {
    name: "create_3d_scene",
    dataSource: compute("internal"),
    description: translate("create_3d_scene.description"),
    endpoint: {
      method: "POST",
      path: "/compute/3d/scene",
      bodyParams: [
        "scene",
        "objects",
        "options",
        "sessionId",
        "referenceTextureUrl",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_3d_scene.params.sessionId"),
        },
        scene: {
          type: "object",
          description: translate("create_3d_scene.params.scene"),
          properties: {
            environment: {
              type: "string",
              enum: [
                "studio",
                "outdoor",
                "night",
                "sunset",
                "dawn",
                "warehouse",
                "neutral",
              ],
              description: translate("create_3d_scene.params.scene.params.environment"),
            },
            background: {
              type: "string",
              description: translate("common.params.backgroundColorDefault"),
            },
            ground: {
              type: "object",
              properties: {
                enabled: {
                  type: "boolean",
                  description: translate("create_3d_scene.params.scene.params.ground.params.enabled"),
                },
                color: {
                  type: "string",
                  description: translate("create_3d_scene.params.scene.params.ground.params.color"),
                },
                size: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.ground.params.size"),
                },
              },
              description: translate("create_3d_scene.params.scene.params.ground"),
            },
            camera: {
              type: "object",
              properties: {
                position: {
                  type: "array",
                  items: { type: "number" },
                  description: translate("create_3d_scene.params.scene.params.camera.params.position"),
                },
                target: {
                  type: "array",
                  items: { type: "number" },
                  description: translate("create_3d_scene.params.scene.params.camera.params.target"),
                },
                fov: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.camera.params.fov"),
                },
                autoOrbit: {
                  type: "boolean",
                  description: translate("create_3d_scene.params.scene.params.camera.params.autoOrbit"),
                },
                autoOrbitSpeed: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.camera.params.autoOrbitSpeed"),
                },
              },
              description: translate("create_3d_scene.params.scene.params.camera"),
            },
            fog: {
              type: "object",
              properties: {
                enabled: {
                  type: "boolean",
                  description: translate("create_3d_scene.params.scene.params.fog.params.enabled"),
                },
                color: {
                  type: "string",
                  description: translate("create_3d_scene.params.scene.params.fog.params.color"),
                },
                near: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.fog.params.near"),
                },
                far: {
                  type: "number",
                  description: translate("create_3d_scene.params.scene.params.fog.params.far"),
                },
              },
              description: translate("create_3d_scene.params.scene.params.fog"),
            },
          },
        },
        objects: {
          type: "array",
          description: translate("create_3d_scene.params.objects"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "box",
                  "sphere",
                  "cylinder",
                  "cone",
                  "torus",
                  "torusKnot",
                  "plane",
                  "ring",
                  "circle",
                  "dodecahedron",
                  "icosahedron",
                  "octahedron",
                  "tetrahedron",
                  "capsule",
                  "group",
                  "text3d",
                ],
                description: translate("create_3d_scene.params.objects.items.params.type"),
              },
              name: { type: "string", description: translate("common.params.optionalName") },
              size: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.size"),
              },
              radius: {
                type: "number",
                description: translate("create_3d_scene.params.objects.items.params.radius"),
              },
              height: {
                type: "number",
                description: translate("create_3d_scene.params.objects.items.params.height"),
              },
              position: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.position"),
              },
              rotation: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.rotation"),
              },
              scale: {
                type: "array",
                items: { type: "number" },
                description: translate("create_3d_scene.params.objects.items.params.scale"),
              },
              material: {
                type: "object",
                properties: {
                  color: { type: "string", description: translate("common.params.cssColor") },
                  metalness: { type: "number", description: translate("common.params.zeroToOne") },
                  roughness: { type: "number", description: translate("common.params.zeroToOne") },
                  opacity: { type: "number", description: translate("common.params.zeroToOne") },
                  emissive: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.emissive"),
                  },
                  wireframe: { type: "boolean" },
                  doubleSided: {
                    type: "boolean",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.doubleSided"),
                  },
                  textureUrl: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.material.params.textureUrl"),
                  },
                },
                description: translate("create_3d_scene.params.objects.items.params.material"),
              },
              animation: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["spin", "bounce", "orbit", "pulse", "float"],
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.type"),
                  },
                  speed: {
                    type: "number",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.speed"),
                  },
                  axis: {
                    type: "string",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.axis"),
                  },
                  amplitude: {
                    type: "number",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.amplitude"),
                  },
                  radius: {
                    type: "number",
                    description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.radius"),
                  },
                },
                description: translate("create_3d_scene.params.objects.items.params.animation"),
              },
              children: {
                type: "array",
                description: translate("create_3d_scene.params.objects.items.params.children"),
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: [
                        "box",
                        "sphere",
                        "cylinder",
                        "cone",
                        "torus",
                        "torusKnot",
                        "plane",
                        "ring",
                        "circle",
                        "dodecahedron",
                        "icosahedron",
                        "octahedron",
                        "tetrahedron",
                        "capsule",
                        "group",
                        "text3d",
                      ],
                      description: translate("create_3d_scene.params.objects.items.params.children.items.params.type"),
                    },
                    name: { type: "string", description: translate("common.params.optionalName") },
                    size: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.size"),
                    },
                    radius: {
                      type: "number",
                      description: translate("create_3d_scene.params.objects.items.params.radius"),
                    },
                    height: {
                      type: "number",
                      description: translate("create_3d_scene.params.objects.items.params.height"),
                    },
                    position: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.position"),
                    },
                    rotation: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.rotation"),
                    },
                    scale: {
                      type: "array",
                      items: { type: "number" },
                      description: translate("create_3d_scene.params.objects.items.params.scale"),
                    },
                    material: {
                      type: "object",
                      properties: {
                        color: { type: "string", description: translate("common.params.cssColor") },
                        metalness: { type: "number", description: translate("common.params.zeroToOne") },
                        roughness: { type: "number", description: translate("common.params.zeroToOne") },
                        opacity: { type: "number", description: translate("common.params.zeroToOne") },
                        emissive: {
                          type: "string",
                          description: translate("create_3d_scene.params.objects.items.params.material.params.emissive"),
                        },
                        wireframe: { type: "boolean" },
                        doubleSided: {
                          type: "boolean",
                          description: translate("create_3d_scene.params.objects.items.params.material.params.doubleSided"),
                        },
                        textureUrl: {
                          type: "string",
                          description: translate("create_3d_scene.params.objects.items.params.material.params.textureUrl"),
                        },
                      },
                      description: translate("create_3d_scene.params.objects.items.params.material"),
                    },
                    animation: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["spin", "bounce", "orbit", "pulse", "float"],
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.type"),
                        },
                        speed: {
                          type: "number",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.speed"),
                        },
                        axis: {
                          type: "string",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.axis"),
                        },
                        amplitude: {
                          type: "number",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.amplitude"),
                        },
                        radius: {
                          type: "number",
                          description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation.params.radius"),
                        },
                      },
                      description: translate("create_3d_scene.params.objects.items.params.children.items.params.animation"),
                    },
                    content: {
                      type: "string",
                      description: translate("create_3d_scene.params.objects.items.params.content"),
                    },
                    fontSize: {
                      type: "number",
                      description: translate("create_3d_scene.params.objects.items.params.fontSize"),
                    },
                  },
                  required: ["type"],
                },
              },
              content: {
                type: "string",
                description: translate("create_3d_scene.params.objects.items.params.content"),
              },
              fontSize: {
                type: "number",
                description: translate("create_3d_scene.params.objects.items.params.fontSize"),
              },
            },
            required: ["type"],
          },
        },
        options: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: translate("common.params.overlayTitle"),
            },
            showGrid: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.showGrid"),
            },
            showAxes: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.showAxes"),
            },
            enableShadows: {
              type: "boolean",
              description: translate("create_3d_scene.params.options.params.enableShadows"),
            },
          },
          description: translate("create_3d_scene.params.options"),
        },
      },
      required: ["objects"],
    },
    display: {
      activeVerb: "Creating 3D scene",
      completedVerb: "Created 3D scene",
      subjectParam: "sessionId",
      subjectFormat: "full",
    },
  },
  {
    name: "get_emoji_combination",
    dataSource: cached("Google Emoji Kitchen", EMOJI_KITCHEN_INTERVAL_MS),
    description: translate("get_emoji_combination.description"),
    endpoint: {
      method: "GET",
      path: "/creative/emoji-kitchen/combine",
      queryParams: ["left", "right"],
    },
    parameters: {
      type: "object",
      properties: {
        left: {
          type: "string",
          description: translate("get_emoji_combination.params.left"),
        },
        right: {
          type: "string",
          description: translate("get_emoji_combination.params.right"),
        },
      },
      required: ["left", "right"],
    },
  },
  {
    name: "get_emoji_combinations",
    dataSource: cached("Google Emoji Kitchen", EMOJI_KITCHEN_INTERVAL_MS),
    description: translate("get_emoji_combinations.description"),
    endpoint: {
      method: "GET",
      path: "/creative/emoji-kitchen/combinations",
      queryParams: ["emoji", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        emoji: {
          type: "string",
          description: translate("get_emoji_combinations.params.emoji"),
        },
        limit: {
          type: "number",
          description: translate("get_emoji_combinations.params.limit"),
        },
      },
      required: ["emoji"],
    },
  },
  {
    name: "generate_image",

    dataSource: onDemand("Google Gemini via Prism"),
    description: translate("generate_image.description"),
    endpoint: {
      method: "POST",
      path: "/creative/generate-image",
      bodyParams: ["prompt", "referenceImages"],
    },
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: translate("generate_image.params.prompt"),
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "describe_image",
    dataSource: onDemand("Google Gemini via Prism"),
    description: translate("describe_image.description"),
    endpoint: {
      method: "POST",
      path: "/creative/describe-image",
      bodyParams: ["imageUrls", "context"],
    },
    parameters: {
      type: "object",
      properties: {
        imageUrls: {
          type: "array",
          items: { type: "string" },
          description: translate("describe_image.params.imageUrls"),
        },
        context: {
          type: "string",
          enum: ["avatar", "banner", "photo", "general"],
          description: translate("describe_image.params.context"),
        },
      },
      required: ["imageUrls"],
    },
  },
  {
    name: "synthesize_speech",
    dataSource: onDemand("Inworld / ElevenLabs / OpenAI / Google via Prism"),
    description: translate("synthesize_speech.description"),
    endpoint: {
      path: "/creative/text-to-speech",
      method: "POST",
      bodyParams: ["text", "voice"],
    },
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: translate("synthesize_speech.params.text"),
        },
        voice: {
          type: "string",
          description: translate("synthesize_speech.params.voice"),
        },
      },
      required: ["text"],
    },
  },
  {
    name: "synthesize_speech_local",
    dataSource: compute("espeak-ng (local)"),
    description: translate("synthesize_speech_local.description"),
    endpoint: {
      path: "/creative/local-text-to-speech",
      method: "POST",
      bodyParams: ["text", "voice", "speed", "pitch", "volume", "wordGap"],
    },
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: translate("synthesize_speech_local.params.text"),
        },
        voice: {
          type: "string",
          description: translate("synthesize_speech_local.params.voice"),
        },
        speed: {
          type: "integer",
          description: translate("synthesize_speech_local.params.speed"),
        },
        pitch: {
          type: "integer",
          description: translate("synthesize_speech_local.params.pitch"),
        },
        volume: {
          type: "integer",
          description: translate("synthesize_speech_local.params.volume"),
        },
        wordGap: {
          type: "integer",
          description: translate("synthesize_speech_local.params.wordGap"),
        },
      },
      required: ["text"],
    },
  },
  {
    name: "create_vector_animation",
    dataSource: onDemand("Creative Vector Animation Engine"),
    description: translate("create_vector_animation.description"),
    endpoint: {
      method: "POST",
      path: "/creative/vector-animation",
      bodyParams: ["animation", "options", "sessionId", "referenceImageUrl"],
    },
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: translate("create_vector_animation.params.sessionId"),
        },
        options: {
          type: "object",
          properties: {
            loop: {
              type: "boolean",
              description: translate("create_vector_animation.params.options.params.loop"),
            },
            autoplay: {
              type: "boolean",
              description: translate("create_vector_animation.params.options.params.autoplay"),
            },
            title: {
              type: "string",
              description: translate("create_vector_animation.params.options.params.title"),
            },
          },
        },
        animation: {
          type: "object",
          description: translate("create_vector_animation.params.animation"),
          properties: {
            clearSession: {
              type: "boolean",
              description: translate("create_vector_animation.params.animation.params.clearSession"),
            },
            width: {
              type: "integer",
              description: translate("create_vector_animation.params.animation.params.width"),
            },
            height: {
              type: "integer",
              description: translate("create_vector_animation.params.animation.params.height"),
            },
            duration: {
              type: "number",
              description: translate("create_vector_animation.params.animation.params.duration"),
            },
            fps: {
              type: "integer",
              description: translate("create_vector_animation.params.animation.params.fps"),
            },
            background: {
              type: "string",
              description: translate("create_vector_animation.params.animation.params.background"),
            },
            layers: {
              type: "array",
              description: translate("create_vector_animation.params.animation.params.layers"),
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.id"),
                  },
                  action: {
                    type: "string",
                    enum: ["delete"],
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.action"),
                  },
                  replaceKeyframes: {
                    type: "boolean",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.replaceKeyframes"),
                  },
                  shapeType: {
                    type: "string",
                    enum: [
                      "rectangle",
                      "circle",
                      "ellipse",
                      "line",
                      "polygon",
                      "path",
                      "text",
                    ],
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.shapeType"),
                  },
                  shapeData: {
                    type: "object",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.shapeData"),
                  },
                  fillColor: {
                    anyOf: [
                      {
                        type: "string",
                        description: translate("create_vector_animation.params.fillColor"),
                      },
                      {
                        type: "object",
                        description: translate("create_vector_animation.params.fillGradient"),
                        properties: {
                          type: {
                            type: "string",
                            enum: ["linear", "radial"],
                          },
                          x1: {
                            type: "number",
                            description: translate("create_vector_animation.params.x1"),
                          },
                          y1: {
                            type: "number",
                            description: translate("create_vector_animation.params.y1"),
                          },
                          x2: {
                            type: "number",
                            description: translate("create_vector_animation.params.x2"),
                          },
                          y2: {
                            type: "number",
                            description: translate("create_vector_animation.params.y2"),
                          },
                          x0: {
                            type: "number",
                            description: translate("create_vector_animation.params.x0"),
                          },
                          y0: {
                            type: "number",
                            description: translate("create_vector_animation.params.y0"),
                          },
                          r0: {
                            type: "number",
                            description: translate("create_vector_animation.params.r0"),
                          },
                          r1: {
                            type: "number",
                            description: translate("create_vector_animation.params.r1"),
                          },
                          stops: {
                            type: "array",
                            description: translate("create_vector_animation.params.stops"),
                            items: {
                              type: "object",
                              properties: {
                                offset: {
                                  type: "number",
                                  description: translate("create_vector_animation.params.offset"),
                                },
                                color: {
                                  type: "string",
                                  description: translate("create_vector_animation.params.color"),
                                },
                              },
                              required: ["offset", "color"],
                            },
                          },
                        },
                        required: ["type", "stops"],
                      },
                    ],
                  },
                  strokeColor: {
                    anyOf: [
                      {
                        type: "string",
                        description: translate("create_vector_animation.params.strokeColor"),
                      },
                      {
                        type: "object",
                        description: translate("create_vector_animation.params.strokeGradient"),
                        properties: {
                          type: {
                            type: "string",
                            enum: ["linear", "radial"],
                          },
                          x1: {
                            type: "number",
                            description: translate("create_vector_animation.params.x1"),
                          },
                          y1: {
                            type: "number",
                            description: translate("create_vector_animation.params.y1"),
                          },
                          x2: {
                            type: "number",
                            description: translate("create_vector_animation.params.x22"),
                          },
                          y2: {
                            type: "number",
                            description: translate("create_vector_animation.params.y22"),
                          },
                          x0: {
                            type: "number",
                            description: translate("create_vector_animation.params.x02"),
                          },
                          y0: {
                            type: "number",
                            description: translate("create_vector_animation.params.y02"),
                          },
                          r0: {
                            type: "number",
                            description: translate("create_vector_animation.params.r02"),
                          },
                          r1: {
                            type: "number",
                            description: translate("create_vector_animation.params.r12"),
                          },
                          stops: {
                            type: "array",
                            description: translate("create_vector_animation.params.stops2"),
                            items: {
                              type: "object",
                              properties: {
                                offset: {
                                  type: "number",
                                  description: translate("create_vector_animation.params.offset2"),
                                },
                                color: {
                                  type: "string",
                                  description: translate("create_vector_animation.params.color2"),
                                },
                              },
                              required: ["offset", "color"],
                            },
                          },
                        },
                        required: ["type", "stops"],
                      },
                    ],
                  },
                  strokeWidth: {
                    type: "number",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.strokeWidth"),
                  },
                  opacity: {
                    type: "number",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.opacity"),
                  },
                  imageUrl: {
                    type: "string",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.imageUrl"),
                  },
                  keyframes: {
                    type: "array",
                    description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes"),
                    items: {
                      type: "object",
                      properties: {
                        time: {
                          type: "number",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.time"),
                        },
                        easing: {
                          type: "string",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.easing"),
                        },
                        motionPath: {
                          type: "object",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.motionPath"),
                          properties: {
                            path: {
                              type: "string",
                              description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.motionPath.params.path"),
                            },
                            orientToPath: {
                              type: "boolean",
                              description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.motionPath.params.orientToPath"),
                            },
                          },
                        },
                        properties: {
                          type: "object",
                          description: translate("create_vector_animation.params.animation.params.layers.items.params.keyframes.items.params.properties"),
                        },
                      },
                      required: ["time", "properties"],
                    },
                  },
                },
                required: ["id", "shapeType"],
              },
            },
          },
          required: ["layers"],
        },
      },
      required: ["animation"],
    },
  },
  {
    name: "generate_audio",
    dataSource: compute("SoundSynthesizerService"),
    description: translate("generate_audio.description"),
    endpoint: {
      path: "/creative/generate-audio",
      method: "POST",
      bodyParams: [
        "action",
        "sessionId",
        "channelId",
        "linesPerBeat",
        "rows",
        "append",
        "startRow",
        "clearSession",
        "soundType",
        "presetEffect",
        "duration",
        "waveform",
        "frequency",
        "endFrequency",
        "modulatorFrequency",
        "modulationIndex",
        "envelope",
        "harmonics",
        "lfo",

        "delay",
        "sampleRate",
        "tempo",
        "nodes",
        "tracks",
        "instrument",
        "swing",
        "humanize",
        "timeSignature",
        "volume",
        "effects",
        "nodeChain",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        // ── Tracker workflow params (set action to use) ────────
        action: {
          type: "string",
          enum: ["init", "add_channel", "write_pattern", "render"],
          description: translate("generate_audio.params.action"),
        },
        sessionId: {
          type: "string",
          description: translate("generate_audio.params.sessionId"),
        },
        channelId: {
          type: "string",
          description: translate("generate_audio.params.channelId"),
        },
        volume: {
          type: "number",
          description: translate("generate_audio.params.volume"),
        },
        linesPerBeat: {
          type: "integer",
          description: translate("generate_audio.params.linesPerBeat"),
        },
        effects: {
          type: "object",
          description: translate("generate_audio.params.effects"),
          properties: {
            reverb: {
              type: "object",
              properties: {
                wet: { type: "number", description: translate("generate_audio.params.wet") },
                decayTime: { type: "number", description: translate("generate_audio.params.decayTime") },
              },
            },
            delay: {
              type: "object",
              properties: {
                delayTime: { type: "number", description: translate("generate_audio.params.delayTime") },
                feedback: { type: "number", description: translate("generate_audio.params.feedback") },
                pingPong: { type: "boolean", description: translate("generate_audio.params.pingPong") },
              },
            },
            filter: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["lowpass", "highpass", "bandpass"] },
                cutoff: { type: "number", description: translate("generate_audio.params.cutoff") },
                Q: { type: "number", description: translate("generate_audio.params.Q") },
              },
            },
            distortion: {
              type: "object",
              properties: {
                algorithm: { type: "string", enum: ["soft_clip", "hard_clip", "bitcrush"] },
                drive: { type: "number", description: translate("generate_audio.params.drive") },
              },
            },
          },
        },
        rows: {
          type: "array",
          description: translate("generate_audio.params.rows"),
          items: {
            type: "object",
            properties: {
              note: {
                type: "string",
                description: translate("generate_audio.params.rows.items.params.note"),
              },
              velocity: {
                type: "number",
                description: translate("generate_audio.params.rows.items.params.velocity"),
              },
              duration: {
                type: "integer",
                description: translate("generate_audio.params.rows.items.params.duration"),
              },
            },
            required: ["note", "duration"],
          },
        },
        append: {
          type: "boolean",
          description: translate("generate_audio.params.append"),
        },
        startRow: {
          type: "integer",
          description: translate("generate_audio.params.startRow"),
        },
        clearSession: {
          type: "boolean",
          description: translate("generate_audio.params.clearSession"),
        },
        // ── Direct synthesis params (no action needed) ─────────
        soundType: {
          type: "string",
          enum: [
            "synthesizer",
            "sound_effect",
            "modular",
          ],
          description: translate("generate_audio.params.soundType"),
        },
        presetEffect: {
          type: "string",
          enum: [
            "laser",
            "coin",
            "powerup",
            "jump",
            "explosion",
            "synthwave_bass",
            "ambient_pad",
            "sci_fi_sweep",
          ],
          description: translate("generate_audio.params.presetEffect"),
        },
        duration: {
          type: "number",
          description: translate("generate_audio.params.duration"),
        },
        waveform: {
          type: "string",
          enum: ["sine", "triangle", "sawtooth", "square", "noise"],
          description: translate("generate_audio.params.waveform"),
        },
        frequency: {
          type: "string",
          description: translate("generate_audio.params.frequency"),
        },
        endFrequency: {
          type: "string",
          description: translate("generate_audio.params.endFrequency"),
        },
        modulatorFrequency: {
          type: "number",
          description: translate("generate_audio.params.modulatorFrequency"),
        },
        modulationIndex: {
          type: "number",
          description: translate("generate_audio.params.modulationIndex"),
        },
        envelope: {
          type: "object",
          description: translate("generate_audio.params.envelope"),
          properties: {
            attack: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.attack"),
            },
            decay: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.decay"),
            },
            sustain: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.sustain"),
            },
            release: {
              type: "number",
              description: translate("generate_audio.params.envelope.params.release"),
            },
          },
        },
        harmonics: {
          type: "array",
          items: { type: "number" },
          description: translate("generate_audio.params.harmonics"),
        },
        lfo: {
          type: "object",
          description: translate("generate_audio.params.lfo"),
          properties: {
            frequency: {
              type: "number",
              description: translate("generate_audio.params.lfo.params.frequency"),
            },
            pitchDepth: { type: "number", description: translate("generate_audio.params.pitchDepth") },
            amplitudeDepth: {
              type: "number",
              description: translate("generate_audio.params.lfo.params.amplitudeDepth"),
            },
          },
          required: ["frequency"],
        },

        delay: {
          type: "object",
          description: translate("generate_audio.params.delay"),
          properties: {
            delayTime: {
              type: "number",
              description: translate("generate_audio.params.delay.params.delayTime"),
            },
            feedback: {
              type: "number",
              description: translate("generate_audio.params.delay.params.feedback"),
            },
          },
          required: ["delayTime", "feedback"],
        },
        sampleRate: {
          type: "number",
          description: translate("generate_audio.params.sampleRate"),
        },
        tempo: {
          type: "number",
          description: translate("generate_audio.params.tempo"),
        },
        nodes: {
          type: "object",
          description: translate("generate_audio.params.nodes"),
        },
        tracks: {
          type: "array",
          description: translate("generate_audio.params.tracks"),
          items: {
            type: "object",
            properties: {
              nodeChain: {
                type: "array",
                items: { type: "string" },
                description: translate("generate_audio.params.tracks.items.params.nodeChain"),
              },
              notes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    time: {
                      type: "string",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.time"),
                    },
                    duration: {
                      type: "string",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.duration"),
                    },
                    note: {
                      type: "string",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.note"),
                    },
                    velocity: {
                      type: "number",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.velocity"),
                    },
                    pitchBend: {
                      type: "object",
                      description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend"),
                      properties: {
                        target: {
                          type: "string",
                          description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend.params.target"),
                        },
                        startTime: {
                          type: "number",
                          description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend.params.startTime"),
                        },
                        endTime: {
                          type: "number",
                          description: translate("generate_audio.params.tracks.items.params.notes.items.params.pitchBend.params.endTime"),
                        },
                      },
                      required: ["target"],
                    },
                  },
                  required: ["time", "duration", "note"],
                },
              },
              volume: {
                type: "number",
                description: translate("generate_audio.params.tracks.items.params.volume"),
              },
              repeat: {
                type: "integer",
                description: translate("generate_audio.params.tracks.items.params.repeat"),
              },
            },
            required: ["nodeChain", "notes"],
          },
        },
        instrument: {
          type: "string",
          enum: [
            "acoustic_guitar",
            "electric_guitar",
            "nylon_guitar",
            "piano",
            "electric_piano",
            "organ",
            "trumpet",
            "violin",
            "cello",
            "flute",
            "clarinet",
            "synth_lead",
            "synth_pad",
            "synth_bass",
            "bass_guitar",
            "marimba",
            "vibraphone",
            "harmonica",
          ],
          description: translate("generate_audio.params.instrument"),
        },
        swing: {
          type: "number",
          description: translate("generate_audio.params.swing"),
        },
        humanize: {
          type: "number",
          description: translate("generate_audio.params.humanize"),
        },
        timeSignature: {
          type: "array",
          items: { type: "integer" },
          description: translate("generate_audio.params.timeSignature"),
        },
      },
    },
  },
  {
    name: "remix_audio",
    dataSource: compute("ffmpeg"),
    description: translate("remix_audio.description"),
    endpoint: {
      path: "/creative/remix-audio",
      method: "POST",
      bodyParams: ["input", "operations", "preset", "outputFormat", "sampleRate"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("remix_audio.params.input"),
        },
        operations: {
          type: "array",
          description: translate("remix_audio.params.operations"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "pitch_shift", "tempo", "speed", "reverb", "echo",
                  "lowpass", "highpass", "bandpass", "equalizer",
                  "bass_boost", "treble_boost", "distortion",
                  "chorus", "flanger", "phaser", "tremolo", "vibrato",
                  "compressor", "normalize", "reverse",
                  "fade_in", "fade_out", "trim", "volume",
                  "stereo_pan", "bitcrush", "crystalizer",
                ],
                description: translate("remix_audio.params.operations.items.params.type"),
              },
              semitones: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.semitones"),
              },
              factor: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.factor"),
              },
              delay: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.delay"),
              },
              decay: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.decay"),
              },
              delays: {
                type: "array",
                items: { type: "number" },
                description: translate("remix_audio.params.operations.items.params.delays"),
              },
              decays: {
                type: "array",
                items: { type: "number" },
                description: translate("remix_audio.params.operations.items.params.decays"),
              },
              frequency: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.frequency"),
              },
              width: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.width"),
              },
              gain: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.gain"),
              },
              color: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.color"),
              },
              depth: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.depth"),
              },
              speed: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.speed"),
              },
              threshold: { type: "number", description: translate("remix_audio.params.threshold") },
              ratio: { type: "number", description: translate("remix_audio.params.ratio") },
              attack: { type: "number", description: translate("remix_audio.params.attack") },
              release: { type: "number", description: translate("remix_audio.params.release") },
              duration: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.duration"),
              },
              start: { type: "number", description: translate("remix_audio.params.start") },
              end: { type: "number", description: translate("remix_audio.params.end") },
              level: { type: "number", description: translate("remix_audio.params.level") },
              pan: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.pan"),
              },
              bits: { type: "number", description: translate("remix_audio.params.bits") },
              sampleRate: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.sampleRate"),
              },
              intensity: {
                type: "number",
                description: translate("remix_audio.params.operations.items.params.intensity"),
              },
            },
            required: ["type"],
          },
        },
        preset: {
          type: "string",
          enum: [
            "chipmunk", "demon_voice", "nightcore", "vaporwave",
            "slowed_reverb", "underwater", "radio", "telephone",
            "robot", "cave", "vinyl", "megaphone",
          ],
          description: translate("remix_audio.params.preset"),
        },
        outputFormat: {
          type: "string",
          enum: ["wav", "mp3", "ogg", "opus"],
          description: translate("remix_audio.params.outputFormat"),
        },
        sampleRate: {
          type: "number",
          description: translate("remix_audio.params.sampleRate"),
        },
      },
      required: ["input"],
    },
  },
  {
    name: "transcribe_audio",
    dataSource: onDemand("OpenAI Whisper / Google via Prism"),
    description: translate("transcribe_audio.description"),
    endpoint: {
      path: "/creative/speech-to-text",
      method: "POST",
      bodyParams: ["audioUrl", "audio", "provider", "model", "language"],
    },
    parameters: {
      type: "object",
      properties: {
        audioUrl: {
          type: "string",
          description: translate("transcribe_audio.params.audioUrl"),
        },
        audio: {
          type: "string",
          description: translate("transcribe_audio.params.audio"),
        },
        provider: {
          type: "string",
          description: translate("transcribe_audio.params.provider"),
          enum: ["openai", "google"],
        },
        model: {
          type: "string",
          description: translate("transcribe_audio.params.model"),
        },
        language: {
          type: "string",
          description: translate("transcribe_audio.params.language"),
        },
      },
    },
  },
  ];
}
