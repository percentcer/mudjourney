import {
    APIApplicationCommandInteraction,
    APIChatInputApplicationCommandInteractionData,
    APIApplicationCommandInteractionDataStringOption,
    InteractionResponseType,
    MessageFlags,
} from 'discord-api-types/v10';

import { Env } from '.'

// discord stuff
const DISCORD_API_ENDPOINT = "https://discord.com/api/v10";

async function oai_complete(prompt: string, key: string) {
    const url = 'https://api.openai.com/v1/completions';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            prompt: prompt,
            max_tokens: 256,
            model: "text-davinci-003",
            temperature: 0,
        })
    };
    const response = await fetch(url, options);
    return await response.json();
}

export async function handle(interaction: APIApplicationCommandInteraction, env: Env): Promise<any> {
    if (!interaction.member) {
        // todo: what interactions don't have a member field?
        return fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify({ content: '???' })
        });
    }

    const cmd = interaction.data as APIChatInputApplicationCommandInteractionData;
    var username = interaction.member.user.username;

    switch (cmd.name) {
        // https://discord.com/developers/docs/resources/channel#message-object-message-flags
        case "say": {
            let options = cmd.options;
            let first = options![0] as APIApplicationCommandInteractionDataStringOption;
            let said = first.value;
            let prompt = `
            Please complete the following as if you were the DM of a roleplaying campaign set in a fantasy world. 
            
            The players will describe their actions and you will describe the events that follow, including changes to the environment and reactions from other characters.
            
            A player just said: "${said}".`
            const completion = await oai_complete(prompt, env.OPENAI_SECRET) as {
                choices: [
                    { text: string }
                ]
            };

            let response = `${username} says, "${said}".
            ${completion.choices[0].text}`;

            // todo: it's interesting that we can do a whole host of behaviors here, not just editing the pending response (e.g. create chat channels, append emoji, change player names, etc)
            return fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: response })
            });
        }
        default: break;
    }
}
