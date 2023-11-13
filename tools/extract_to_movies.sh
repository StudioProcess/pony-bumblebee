#!/bin/bash

# 2023-11-08
# Extract archives + encode movies in batches
# Takes less drive space than a full extraction (2TB)
#
# file range  -  anim range
# -------------------------
#     1  3381 -     1  1500
#  3382  6631 -  1501  3000
#  6632 10201 -  3001  4500
# 10202 13863 -  4501  6000
# 13864 18136 -  6001  7500
# 18137 21611 -  7501  8760

# Don't use quotes here, so ~ gets expanded
ARCHIVES=/Volumes/ARCHIVE/pony/full-run-01/
DEST=~/Desktop/pony/
DEST_FULL=~/Desktop/pony/full-run-01_processed/

bell() {
    [[ -z "$1" ]] && N=1 || N=$1
    for i in $(seq $N); do
        afplay /System/Library/Sounds/Hero.aiff
    done
}

notify() {
    # ignore if terminal-notifier doesn't exists
    if type terminal-notifier > /dev/null 2>&1; then
        script=$(basename "$0")
        terminal-notifier -title "$script" -subtitle "$1" -message "$2" -sound "default"
    fi
}

run() {
    ./process_pony.py "$ARCHIVES" "$DEST" -y --extract --from "$1" --to "$2"
    ./process_pony.py "$DEST_FULL" -y --check_extracted
    notify "$3-$4" "Extraction complete"
    
    ./process_pony.py "$DEST_FULL" -y --movies  --from "$3" --to "$4"
    rm -rf "$DEST_FULL/frames"
    notify "$3-$4" "Movies complete"
}

notify "hello" "complete"
exit

run     1  3381      1  1500
run  3382  6631   1501  3000
run  6632 10201   3001  4500
run 10202 13863   4501  6000
run 13864 18136   6001  7500
run 18137 21611   7501  8760

./process_pony.py "$DEST_FULL" -y --check_movies
notify "1-8760" "Complete"