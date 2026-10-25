"""Stage 4: generate textures, strip the control rig, export build/rat_raw.glb (never saves the .blend)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import common  # noqa: E402
import textures  # noqa: E402
from common import check  # noqa: E402
from names import JOINTS  # noqa: E402

OUT = os.path.join(common.BUILD, "rat_raw.glb")
TEX_DIR = os.path.join(common.BUILD, "textures")


def shrink(img):
    while img.shape[0] > common.TEX_SIZE:
        img = textures.downsample2(img)
    return img


def make_textures():
    base = common.load_pixels(common.SRC_TEXTURE)[..., :3]
    lum = textures.luminance(base)
    maps = {"base": (base, "sRGB"),
            "normal": (textures.normal_map(lum), "Non-Color"),
            "metal_rough": (textures.metal_rough(textures.roughness_map(lum)), "Non-Color")}
    images = {}
    for name, (pixels, colorspace) in maps.items():
        path = os.path.join(TEX_DIR, f"{name}.png")
        common.save_pixels(shrink(pixels), path, colorspace)
        img = bpy.data.images.load(path)
        img.colorspace_settings.name = colorspace
        images[name] = img
    return images


def wire_material(mesh, images):
    mat = mesh.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    base_links = bsdf.inputs["Base Color"].links
    check(base_links and base_links[0].from_node.type == "TEX_IMAGE", "base color is not an image texture")
    base_links[0].from_node.image = images["base"]

    normal_tex = nt.nodes.new("ShaderNodeTexImage")
    normal_tex.image = images["normal"]
    normal_map = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    nt.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    rough_tex = nt.nodes.new("ShaderNodeTexImage")
    rough_tex.image = images["metal_rough"]
    split = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(rough_tex.outputs["Color"], split.inputs["Color"])
    nt.links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.5  # source has 0, which disables dielectric specular so the roughness map has no effect
    mat.use_backface_culling = False


def strip_controls(arm):
    for pb in arm.pose.bones:
        for con in list(pb.constraints):
            pb.constraints.remove(con)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in [b for b in arm.data.edit_bones if not b.use_deform]:
        arm.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode="OBJECT")
    check(sorted(b.name for b in arm.data.bones) == sorted(JOINTS), "bones left after stripping controls != JOINTS")
    for track in arm.animation_data.nla_tracks:
        track.mute = False
    arm.animation_data.action = None


def export():
    kwargs = dict(
        filepath=OUT, export_format="GLB", use_selection=False, export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color="NONE",
        export_materials="EXPORT", export_image_format="AUTO",
        export_skins=True, export_def_bones=True, export_all_influences=False, export_influence_nb=4,
        export_morph=False, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
        export_extras=True, export_cameras=False, export_lights=False,
        export_draco_mesh_compression_enable=False)
    valid = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    unknown = sorted(set(kwargs) - valid)
    check(not unknown, f"glTF exporter has no options {unknown}; pick the renamed ones from {sorted(valid)}")
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    arm, mesh = common.arm_obj(), common.mesh_obj()
    wire_material(mesh, make_textures())
    strip_controls(arm)
    export()
    print(f"04_export: wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KiB)")


common.run(main)
