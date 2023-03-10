# this only needs to be run if you're updating commands

import requests
import os

import dotenv

dotenv.load_dotenv()

DISCORD_APP_ID = os.getenv("DISCORD_APP_ID")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID")

urls = [
    f"https://discord.com/api/v10/applications/{DISCORD_APP_ID}/guilds/{DISCORD_GUILD_ID}/commands",
    f"https://discord.com/api/v10/applications/{DISCORD_APP_ID}/guilds/1080651846206640128/commands",
]

CHAT_INPUT = 1
USER = 2
MESSAGE = 3

# data types
T_STRING = 3

# https://discord.com/developers/docs/interactions/application-commands#slash-commands-example-slash-command
commands = [
    {
        "name": "a",
        "type": CHAT_INPUT,
        "description": "Perform an action.",
        "options": [
            {
                "name": "what",
                "description": 'Description of your action, e.g. "Jump over the candlestick"',
                "type": T_STRING,
                "required": True,
            },
            {
                "name": "say",
                "description": "What you say while you're doing it, e.g. \"Here goes nothin'!\"",
                "type": T_STRING,
                "required": False,
            },
        ],
    },
    {
        "name": "j",
        "type": CHAT_INPUT,
        "description": "List the events in your journal.",
    },
    {
        "name": "new-campaign",
        "type": CHAT_INPUT,
        "description": "Create a new campaign.",
        "options": [
            {
                "name": "about",
                "description": 'Description of what the campaign is about, e.g. "a fantasy world under the control of a dark wizard"',
                "type": T_STRING,
                "required": True,
            }
        ],
    },
]

# For authorization, you can use either your bot token
headers = {"Authorization": f"Bot {DISCORD_BOT_TOKEN}"}

for _url in urls:
    # delete all old commands
    result = requests.get(_url, headers=headers).json()
    [requests.delete(_url + f'/{c["id"]}', headers=headers) for c in result]
    # and then regenerate the ones specified in this file
    [requests.post(_url, headers=headers, json=c) for c in commands]
