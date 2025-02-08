#!/bin/bash

REPO="ducktors/turborepo-remote-cache"
KEEP_ENVS=("production" "github-pages")

# Verify GitHub CLI authentication
if ! gh auth status &>/dev/null; then
    echo "Error: Not authenticated with GitHub CLI. Please run 'gh auth login' first."
    exit 1
fi

# Check if repository exists and is accessible
if ! gh repo view $REPO &>/dev/null; then
    echo "Error: Repository '$REPO' not found or not accessible."
    exit 1
fi

# Fetch environments with error handling
environments=$(gh api repos/$REPO/environments 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "Error: Failed to fetch environments. Please check repository permissions."
    exit 1
fi

# Process environments
echo "$environments" | jq -r '.environments[].name' | while read -r env; do
    if [[ ! " ${KEEP_ENVS[@]} " =~ " ${env} " ]]; then
        echo "Deleting environment: $env"
        # URL encode the environment name
        encoded_env=$(printf '%s' "$env" | jq -sRr @uri)
        if ! gh api -X DELETE "repos/$REPO/environments/$encoded_env" &>/dev/null; then
            echo "Warning: Failed to delete environment: $env"
        fi
    else
        echo "Keeping environment: $env"
    fi
done
