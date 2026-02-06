import {Center, Container, Loader} from '@mantine/core';
import SettingsDualPane from "./SettingsDualPane.tsx";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {client} from "../../api";
import {type UpdateSystemSettingSchema} from "@backstream/shared";
import {ensureSuccess} from "../../util/api.ts";
import {notice} from "../../util/notification.tsx";

export function SettingsPage() {

    // --- 2. FETCH DATA ---
    const queryClient = useQueryClient();
    const {data, isLoading} = useQuery({
        queryKey: ['setting'],
        queryFn: async () => {
            const res = await client.api.setting['system-setting'].$get();
            if (!res.ok) throw new Error('Failed to fetch system setting');
            return res.json();
        },
    });

    // --- 3. UPDATE MUTATION ---
    const submitMutation = useMutation({
        mutationFn: async (item: UpdateSystemSettingSchema) => {
            return ensureSuccess(
                client.api.setting[':id'].$patch({
                    param: { id: item.id.toString() },
                    json: item
                })
            )
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({queryKey: ['setting']});
            notice(true, "System setting updated successfully");
            close();
        },
        onError: () => notice(false, "Failed to update system setting"),
    });

    if (isLoading) {
        return (
            <Center h={400}>
                <Loader size="xl"/>
            </Center>
        );
    }

    return (
        <Container size="xl" py="lg">
            <SettingsDualPane
                initialData={data!}
                onSubmit={(item) => submitMutation.mutate(item)}
                isLoading={isLoading} />
        </Container>
    )
}

export default SettingsPage;