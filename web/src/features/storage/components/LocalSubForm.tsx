import type {InsertRepositorySchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import PathSuggestion from "../../../component/PathSuggestion.tsx";

export function LocalSubForm({form}: { form: UseFormReturnType<InsertRepositorySchema> }) {
    return (
        <PathSuggestion
            label="Path"
            placeholder="/mnt/nas/..."
            required={true}
            {...form.getInputProps('path')}
        />
    )
}

export default LocalSubForm;