import { Combobox, InputBase, Loader, useCombobox, Group, Text, ScrollArea } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { client } from '../api';
import React from "react";

interface FilePathPickerProps {
    value?: string; // Change to optional
    onChange?: (value: string) => void; // Change to optional
    label?: string;
    placeholder?: string;
    type?: 'file' | 'dir';
    required?: boolean;
    disabled?: boolean;
    error?: React.ReactNode; // Add this so form errors show up
}

export function PathSuggestion({ value = '/', onChange, label, placeholder, type, required, error, disabled }: FilePathPickerProps) {
    const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
    const [debounced] = useDebouncedValue(value, 300);

    const { data, isFetching } = useQuery({
        queryKey: ['fs-suggestions', debounced, type],
        queryFn: async () => {
            // Typed RPC Call - No manual URLs or query string formatting!
            const res = await client.api.info['path-suggestion'].$get({
                query: {
                    path: debounced,
                    limit: '10',
                    type: type ?? undefined, // Type-safe parameter
                },
            });

            if (!res.ok) return { results: [] };
            return await res.json();
        },
        enabled: debounced.length > 0,
    });

    const suggestions = data?.results || [];

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        // If user hits Tab and we have at least one suggestion
        if (event.key === 'Tab' && suggestions.length > 0) {
            event.preventDefault(); // Stop focus from moving
            onChange?.(suggestions[0].fullPath); // Apply the top result
            combobox.closeDropdown();
        }
    };

    return (
        <Combobox
            store={combobox}
            onOptionSubmit={(val) => {
                onChange?.(val);
                combobox.closeDropdown();
            }}
        >
            <Combobox.Target>
                <InputBase
                    label={label}
                    placeholder={placeholder}
                    required={required}
                    disabled={disabled}
                    error={error} // Display the form error message
                    value={value}
                    onKeyDown={handleKeyDown}
                    onChange={(e) => {
                        onChange?.(e.currentTarget.value); // Call optional onChange
                        combobox.openDropdown();
                    }}
                    onClick={() => combobox.openDropdown()}
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => combobox.closeDropdown()}
                    rightSection={isFetching ? <Loader size="xs" /> : <Combobox.Chevron />}
                />
            </Combobox.Target>

            <Combobox.Dropdown>
                <Combobox.Options>
                    <ScrollArea.Autosize mah={300} type="scroll">
                        {suggestions.length > 0 ? (
                            suggestions.map((item, index) => (
                                <Combobox.Option value={item.fullPath} key={item.name} active={index === 0}>
                                    <Group gap="xs" wrap="nowrap">
                                        <Text size="xs">{item.type === 'dir' ? '📁' : '📄'}</Text>
                                        <Text size="sm" truncate>{item.name}</Text>

                                        {/* Visual helper for the top result */}
                                        {index === 0 && (
                                            <Text size="xs" c="dimmed" ml="auto" style={{ whiteSpace: 'nowrap' }}>
                                                [Tab]
                                            </Text>
                                        )}
                                    </Group>
                                </Combobox.Option>
                            ))
                        ) : !isFetching && value.length > 0 ? (
                            <Combobox.Empty>Nothing found...</Combobox.Empty>
                        ) : (
                            <Combobox.Empty>Enter path...</Combobox.Empty>
                        )}
                    </ScrollArea.Autosize>
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    );
}

export default PathSuggestion;
