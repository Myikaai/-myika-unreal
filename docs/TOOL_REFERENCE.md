# Tool Reference

## 1. list_assets
List UAssets in the project. Optional path/class filters.

## 2. read_file
Read a text file from the project. Rejects binary/unsafe paths.

## 3. write_file
Write a text file to the project. Auto-creates git checkpoint before write.

## 4. run_python
Execute arbitrary Python in the UE editor. Logged to JSONL audit trail.

## 5. get_compile_errors
Return current Blueprint and C++ compile errors from editor logs.

## 6. read_blueprint_summary
Return structured summary of a Blueprint asset (components, variables, functions, events).

See MYIKA_UNREAL_DEMO_SPEC.md §7 for full schemas.
