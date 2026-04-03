import type {StorageCreateSchema} from "@backstream/shared";
import type {UseFormReturnType} from "@mantine/form";
import PathSuggestion from "../../../component/PathSuggestion.tsx";

export function LocalSubForm({form}: { form: UseFormReturnType<StorageCreateSchema> }) {
    return (
        <PathSuggestion
            label="Path"
            placeholder="/mnt/nas/..."
            required={true}
            {...form.getInputProps('meta.path')}
        />
    )
}

export default LocalSubForm;