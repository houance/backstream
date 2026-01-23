import {Group, Text, Box, Stepper, Button} from '@mantine/core';
import React, {useState} from "react";

import PolicyTypeSelection from "./components/PolicyTypeSelection.tsx";
import {BACKUP_POLICIES, type PolicyType} from "./config.tsx";

const CreatePolicyPage: React.FC = () => {
    const [active, setActive] = useState(0);
    const [type, setType] = useState<PolicyType | null>(null);

    const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
    const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

    // Helper to render the dynamic config form
    const SelectedForm = type ? BACKUP_POLICIES[type].component : null;

    return (
        <Box p="md">
            <Stepper active={active} onStepClick={setActive}>
                {/* Step 1: Selection */}
                <Stepper.Step label="Select Type" description="Choose backup logic">
                    <PolicyTypeSelection value={type} onChange={(val) => setType(val as PolicyType)} />
                </Stepper.Step>

                {/* Step 2: Dynamic Configuration */}
                <Stepper.Step label="Configure" description="Set source and destination">
                    {SelectedForm && <SelectedForm />}
                </Stepper.Step>

                {/* Step 3: Scheduling */}
                <Stepper.Step label="Schedule" description="When to run">
                    <Text>Common Scheduling Component Here...</Text>
                </Stepper.Step>

                <Stepper.Completed>
                    Completed! Policy is now active.
                </Stepper.Completed>
            </Stepper>

            <Group justify="center" mt="xl">
                <Button variant="default" onClick={prevStep} disabled={active === 0}>
                    Back
                </Button>
                <Button onClick={nextStep} disabled={active === 0 && !type}>
                    {active === 2 ? 'Create Policy' : 'Next step'}
                </Button>
            </Group>
        </Box>
    );
}

export default CreatePolicyPage;