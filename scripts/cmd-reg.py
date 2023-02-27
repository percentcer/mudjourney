# this only needs to be run if you're updating commands

import requests
import os

import dotenv

dotenv.load_dotenv()

DISCORD_APP_ID = os.getenv("DISCORD_APP_ID")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID")

url = f"https://discord.com/api/v10/applications/{DISCORD_APP_ID}/guilds/{DISCORD_GUILD_ID}/commands"

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
]

# For authorization, you can use either your bot token
headers = {"Authorization": f"Bot {DISCORD_BOT_TOKEN}"}

# delete all old commands
result = requests.get(url, headers=headers).json()
[requests.delete(url + f'/{c["id"]}', headers=headers) for c in result]

# and then regenerate the ones specified in this file
[requests.post(url, headers=headers, json=c) for c in commands]
