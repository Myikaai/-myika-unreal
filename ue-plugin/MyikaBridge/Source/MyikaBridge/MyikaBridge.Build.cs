using UnrealBuildTool;

public class MyikaBridge : ModuleRules
{
    public MyikaBridge(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "Networking",
            "Sockets",
            "Json",
            "JsonUtilities",
            "HTTP"
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "PythonScriptPlugin"
        });
    }
}
