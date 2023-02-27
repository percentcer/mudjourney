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
            temperature: 0.8,
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
        case "a": {
            let options = cmd.options!;
            let action = (options[0] as APIApplicationCommandInteractionDataStringOption).value;
            let said = options.length > 1 ? (options[1] as APIApplicationCommandInteractionDataStringOption).value : "";
            let optional_said = options.length > 1 ? ` and said "${said}" while doing so` : "";
            let prompt = `
            The following is a description of events, as described by a dungeon master, in a fantasy roleplaying campaign called "A Long and Treacherous Journey".
            
            If these events modify the player's health, stats, or inventory those changes are appended to the output as a bullet list in the form "subject: <change>"
            If these events lead the party to a new location, that location is appended to the output in the form "location: <location_name>"
            Finally, a short summary of the event is appended to the output in the form of "history: <summary>"
            
            A player named ${username} has just performed an action: ${action}${optional_said}.
            
            DM: `
            const completion = await oai_complete(prompt, env.OPENAI_SECRET) as {
                choices: [
                    { text: string }
                ]
            };

            let response = `${username}: [${action}] ${said ? `"${said}"` : ""}
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
