#!/bin/sh
set -eu

runtime=/usr/local/antmedia
start_script="$runtime/start.sh"
live_properties="$runtime/webapps/live/WEB-INF/red5-web.properties"

# Ant Media's stock start script normally clears server.name. Preserve the
# Compose environment value so Docker's private address is never advertised.
sed -i \
  's/^REPLACE_CANDIDATE_ADDRESS_WITH_SERVER_NAME=false$/REPLACE_CANDIDATE_ADDRESS_WITH_SERVER_NAME=true/' \
  "$start_script"
sed -i \
  's/^SERVER_ADDRESS=$/SERVER_ADDRESS=${ANT_MEDIA_SERVER_NAME}/' \
  "$start_script"

# The upstream script expects the licence as a command-line flag. Keeping the
# existing environment value avoids putting the key in the container command.
sed -i \
  's/^LICENSE_KEY=$/LICENSE_KEY=${LICENSE_KEY}/' \
  "$start_script"

set_property() {
  key=$1
  value=$2
  file=$3

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

set_property webRTCPortRangeMin 62000 "$live_properties"
set_property webRTCPortRangeMax 62100 "$live_properties"
set_property settings.replaceCandidateAddrWithServerAddr true "$live_properties"
set_property replaceCandidateAddrWithServerAddr true "$live_properties"
