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
            "WebSockets",
            "Networking",
            "Sockets"
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "PythonScriptPlugin"
        });
    }
}
