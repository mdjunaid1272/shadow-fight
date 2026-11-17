"""
Blender (headless) pipeline: character-fight.blend -> public/assets/characters/titan.glb

  blender -b character-fight.blend --python scripts/blender/export_fighter.py -- <out.glb>

The source is a static, unrigged, high-poly mesh ("Cube", ~58k verts, 4096px texture). This script:
  1. bakes the object transform, turns the fighter to face -Y (glTF +Z) and scales him to ~2.05 m, feet on the floor,
     centred between the feet
  2. decimates to ~25k triangles and downsizes the texture to 1024px
  3. builds an 11-bone armature (+ hand socket) named for GltfAvatar's BONE_ALIASES
  4. skins by distance to the bone segments (robust on AI-generated meshes where heat-weighting fails)
  5. exports a Draco-compressed GLB (no animations: the game drives the bones from its procedural poses)
"""
import sys, math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'titan.glb'
TARGET_TRIS = 25000
HEIGHT = 2.05
TEX = 1024

# ---- joint positions in the ORIGINAL file's coordinates (measured from slice centroids; his right = +X, he faces +Y)
J = {
    'hips':      ((-0.010, -0.065, 0.170), (-0.010, -0.060, 0.220)),
    'spine':     ((-0.010, -0.060, 0.220), (-0.015, -0.050, 0.320)),
    'head':      ((-0.020, -0.040, 0.335), (-0.020, -0.030, 0.415)),
    'upperarm_r': ((0.070, -0.100, 0.300), (0.130, -0.100, 0.280)),
    'forearm_r':  ((0.130, -0.100, 0.280), (0.210, -0.030, 0.250)),
    'upperarm_l': ((-0.085, -0.055, 0.310), (-0.140, -0.020, 0.285)),
    'forearm_l':  ((-0.140, -0.020, 0.285), (-0.210, 0.140, 0.255)),
    'thigh_r':   ((0.040, -0.075, 0.195), (0.050, -0.075, 0.125)),
    'calf_r':    ((0.050, -0.075, 0.125), (0.060, -0.100, 0.025)),
    'thigh_l':   ((-0.060, -0.030, 0.195), (-0.095, 0.005, 0.125)),
    'calf_l':    ((-0.095, 0.005, 0.125), (-0.105, 0.000, 0.025)),
}
PARENT = {'hips': None, 'spine': 'hips', 'head': 'spine', 'upperarm_r': 'spine', 'forearm_r': 'upperarm_r', 'upperarm_l': 'spine',
          'forearm_l': 'upperarm_l', 'thigh_r': 'hips', 'calf_r': 'thigh_r', 'thigh_l': 'hips', 'calf_l': 'thigh_l'}

ob = bpy.data.objects['Cube']
for o in list(bpy.data.objects):
    if o is not ob: bpy.data.objects.remove(o, do_unlink=True)

# ---- 1. bake transform, orient, scale, ground
me = ob.data
me.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
ob.parent = None
ankle_mid = (Vector(J['calf_r'][1]) + Vector(J['calf_l'][1])) * 0.5
zmin = min(v.co.z for v in me.vertices)
k = HEIGHT / (max(v.co.z for v in me.vertices) - zmin)
T = Matrix.Scale(k, 4) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((-ankle_mid.x, -ankle_mid.y, -zmin))
me.transform(T)
def tj(p): return T @ Vector(p)
print('scale', k)

# ---- 2. decimate
tris = sum(len(p.vertices) - 2 for p in me.polygons)
mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = min(1.0, TARGET_TRIS / tris)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.modifier_apply(modifier='dec')
print('tris', tris, '->', sum(len(p.vertices) - 2 for p in ob.data.polygons))
for p in ob.data.polygons: p.use_smooth = True

# texture downsize
for img in bpy.data.images:
    if img.size[0] > TEX and img.users:
        img.scale(TEX, TEX)
        print('scaled', img.name)

# ---- 3. armature
arm_data = bpy.data.armatures.new('FighterRig'); arm = bpy.data.objects.new('FighterRig', arm_data)
bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
for name, (h, t) in J.items():
    b = arm_data.edit_bones.new(name); b.head = tj(h); b.tail = tj(t); eb[name] = b
fh = tj(J['forearm_r'][1]); fd = (tj(J['forearm_r'][1]) - tj(J['forearm_r'][0])).normalized()
hand = arm_data.edit_bones.new('hand_r'); hand.head = fh; hand.tail = fh + fd * 0.12; eb['hand_r'] = hand
PARENT['hand_r'] = 'forearm_r'
for n, p in PARENT.items():
    if p: eb[n].parent = eb[p]
bpy.ops.object.mode_set(mode='OBJECT')

# ---- 4. skin: weights from distance to each bone segment
def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
me = ob.data
P = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3).astype(np.float64)
names = list(J.keys())
D = np.stack([seg_dist(P, np.array(tj(J[n][0])), np.array(tj(J[n][1]))) for n in names], axis=1)
# bone "radius" so thick parts (torso) win over thin neighbours: subtract a per-bone radius before the falloff
RAD = {'hips': 0.13, 'spine': 0.20, 'head': 0.12, 'upperarm_r': 0.08, 'forearm_r': 0.09, 'upperarm_l': 0.08, 'forearm_l': 0.09,
       'thigh_r': 0.11, 'calf_r': 0.12, 'thigh_l': 0.11, 'calf_l': 0.12}
Dn = np.maximum(D - np.array([RAD[n] for n in names]) * 0.55, 0.003)
W = 1.0 / Dn ** 5
# keep the 3 strongest influences per vertex, normalise
order = np.argsort(-W, axis=1)
keep = np.zeros_like(W, dtype=bool)
for i in range(3): keep[np.arange(len(W)), order[:, i]] = True
W = np.where(keep, W, 0); W /= W.sum(axis=1, keepdims=True)
W[W < 0.02] = 0; W /= W.sum(axis=1, keepdims=True)
for n in names: ob.vertex_groups.new(name=n)
vg = [ob.vertex_groups[n] for n in names]
for j, g in enumerate(vg):
    for vi in np.nonzero(W[:, j] > 0)[0]: g.add([int(vi)], float(W[vi, j]), 'REPLACE')
ob.parent = arm; ob.parent_type = 'OBJECT'
mdf = ob.modifiers.new('Armature', 'ARMATURE'); mdf.object = arm

# ---- 5. export
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
kw = dict(filepath=out, export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
          export_image_format='JPEG', export_image_quality=88, export_apply=False)
try: bpy.ops.export_scene.gltf(**kw, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
except TypeError: bpy.ops.export_scene.gltf(**kw)
print('EXPORTED', out)
