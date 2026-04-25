"""Create Enhanced Input assets (IA_Interact + IMC_Myika) programmatically.

Run via run_python in the UE editor. This replaces manual asset creation —
the agent calls this script to bootstrap the input assets that
UMyikaInteractionComponent depends on.

Usage from agent (via run_python):
    exec(open(r"<plugin_path>/Content/Python/myika/create_input_assets.py").read())

Or more typically, the agent will inline equivalent logic via run_python directly.
This file serves as the reference implementation.
"""

import unreal


def create_input_assets():
    """Create IA_Interact and IMC_Myika under /MyikaBridge/Input/."""

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    package_path = "/MyikaBridge/Input"

    # ---------------------------------------------------------------
    # 1. Create IA_Interact (InputAction)
    # ---------------------------------------------------------------
    ia_path = f"{package_path}/IA_Interact"
    ia_asset = unreal.EditorAssetLibrary.load_asset(ia_path)

    if ia_asset is None:
        ia_factory = unreal.InputActionFactory()
        ia_asset = asset_tools.create_asset(
            "IA_Interact",
            package_path,
            unreal.InputAction,
            ia_factory,
        )
        if ia_asset is None:
            unreal.log_error("[Myika] Failed to create IA_Interact")
            return False

        # InputAction value type: Digital (bool) for a simple press
        ia_asset.set_editor_property("ValueType", unreal.InputActionValueType.BOOLEAN)
        unreal.log("[Myika] Created IA_Interact at " + ia_path)
    else:
        unreal.log("[Myika] IA_Interact already exists, skipping creation")

    # ---------------------------------------------------------------
    # 2. Create IMC_Myika (InputMappingContext)
    # ---------------------------------------------------------------
    imc_path = f"{package_path}/IMC_Myika"
    imc_asset = unreal.EditorAssetLibrary.load_asset(imc_path)

    if imc_asset is None:
        imc_factory = unreal.InputMappingContextFactory()
        imc_asset = asset_tools.create_asset(
            "IMC_Myika",
            package_path,
            unreal.InputMappingContext,
            imc_factory,
        )
        if imc_asset is None:
            unreal.log_error("[Myika] Failed to create IMC_Myika")
            return False

        unreal.log("[Myika] Created IMC_Myika at " + imc_path)
    else:
        unreal.log("[Myika] IMC_Myika already exists, skipping creation")

    # ---------------------------------------------------------------
    # 3. Add IA_Interact mapping to IMC_Myika with E key
    # ---------------------------------------------------------------
    # Reload to ensure we have the latest references
    ia_asset = unreal.EditorAssetLibrary.load_asset(ia_path)
    imc_asset = unreal.EditorAssetLibrary.load_asset(imc_path)

    if ia_asset and imc_asset:
        # Get existing mappings to check if already bound
        mappings = imc_asset.get_editor_property("Mappings")
        already_mapped = False
        if mappings:
            for mapping in mappings:
                action = mapping.get_editor_property("Action")
                if action and action.get_name() == "IA_Interact":
                    already_mapped = True
                    break

        if not already_mapped:
            # Create the mapping: E key -> IA_Interact
            mapping = unreal.EnhancedActionKeyMapping()
            mapping.set_editor_property("Action", ia_asset)
            mapping.set_editor_property("Key", unreal.Key("E"))

            # Add to mappings array
            mappings = list(imc_asset.get_editor_property("Mappings"))
            mappings.append(mapping)
            imc_asset.set_editor_property("Mappings", mappings)

            unreal.log("[Myika] Added E key -> IA_Interact mapping to IMC_Myika")
        else:
            unreal.log("[Myika] E key mapping already exists in IMC_Myika, skipping")

    # ---------------------------------------------------------------
    # 4. Save both assets
    # ---------------------------------------------------------------
    unreal.EditorAssetLibrary.save_asset(ia_path, only_if_is_dirty=False)
    unreal.EditorAssetLibrary.save_asset(imc_path, only_if_is_dirty=False)

    unreal.log("[Myika] Input assets created and saved successfully")
    return True


if __name__ == "__main__" or True:
    # Always run when exec'd or imported directly
    create_input_assets()
