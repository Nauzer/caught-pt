import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { createCollection } from 'meteor/quave:collections';
import { Partitioner } from 'meteor/wildhart:partitioner';
import moment from 'moment';
import _ from 'underscore';

const GameTypes = new Mongo.Collection('GameTypes');
Partitioner.partitionCollection(GameTypes, { multipleGroups: true });

const GameTypeProperties = new Mongo.Collection('GameTypeProperties');
Partitioner.partitionCollection(GameTypeProperties, { multipleGroups: true });

const GameTypeEvents = new Mongo.Collection('GameTypeEvents');
Partitioner.partitionCollection(GameTypeEvents, { multipleGroups: true });

const GameTypeEventActions = new Mongo.Collection('GameTypeEventActions');
Partitioner.partitionCollection(GameTypeEventActions, { multipleGroups: true });
const duplicateEventsAndActions = (
  gameTypeId,
  newGameTypeId,
  propertyDuplicateDict,
  eventIds,
  startMoment
) => {
  // start duplicating events
  let qE = { gameTypeId };
  if (eventIds && eventIds.length > 0) {
    qE = {
      gameTypeId,
      _id: { $in: eventIds },
    };
  }

  const gameTypeEvents = GameTypeEvents.find(qE).fetch();

  console.log(1, moment().diff(startMoment));
  const eventDuplicateDict = {};
  _.each(gameTypeEvents, (evt) => {
    const event = evt;
    const oldEventId = event._id;
    delete event._id;
    event.gameTypeId = newGameTypeId;

    if (
      event.genericProperties &&
      event.genericProperties.eventQuizModeProperties
    ) {
      _.each(event.genericProperties.eventQuizModeProperties, (elem, index) => {
        event.genericProperties.eventQuizModeProperties.splice(
          index,
          1,
          propertyDuplicateDict[elem]
        );
      });
    }

    const newEventId = GameTypeEvents.insert(event);
    eventDuplicateDict[oldEventId] = newEventId;

    // console.log('duplicated event', oldEventId, 'under new _id:', newEventId);
    console.log(1.1, moment().diff(startMoment));
  });

  // console.log('eventDuplicateDict', eventDuplicateDict);

  // start duplicating actions

  let qA = { gameTypeId };
  if (eventIds && eventIds.length > 0) {
    qA = {
      gameTypeId,
      gameTypeEventId: { $in: eventIds },
    };
  }

  const gametypeEventActions = GameTypeEventActions.find(qA).fetch();
  console.log(5.1, moment().diff(startMoment));
  console.log('actions: ', gametypeEventActions.length);

  const actionsDuplicateDict = {};
  _.each(gametypeEventActions, (a) => {
    const action = a;
    const oldActionId = action._id;
    delete action._id;
    action.gameTypeId = newGameTypeId;

    action.gameTypeEventId = eventDuplicateDict[action.gameTypeEventId];
    console.log(5.11, moment().diff(startMoment));

    if (action.targetEventId)
      action.targetEventId = eventDuplicateDict[action.targetEventId];
    if (action.property)
      action.property = propertyDuplicateDict[action.property];
    if (action.genericProperties.errorEventId)
      action.genericProperties.errorEventId =
        eventDuplicateDict[action.genericProperties.errorEventId];
    if (action.genericProperties.defaultOption)
      action.genericProperties.defaultOption = {
        targetEventId:
          eventDuplicateDict[
            action.genericProperties.defaultOption.targetEventId
          ],
      };
    if (action.genericProperties.propertyAwardProperty) {
      action.genericProperties.propertyAwardProperty =
        propertyDuplicateDict[action.genericProperties.propertyAwardProperty];
      console.log(5.12, moment().diff(startMoment));
    }
    if (action.genericProperties.quizModePropertiesWithValues) {
      _.each(
        action.genericProperties.quizModePropertiesWithValues,
        (value, key) => {
          const oldKey = key;
          const newKey = propertyDuplicateDict[key];
          if (oldKey !== newKey) {
            Object.defineProperty(
              action.genericProperties.quizModePropertiesWithValues,
              newKey,
              Object.getOwnPropertyDescriptor(
                action.genericProperties.quizModePropertiesWithValues,
                oldKey
              )
            );
            delete action.genericProperties.quizModePropertiesWithValues[
              oldKey
            ];
            console.log(5.13, moment().diff(startMoment));
          }
        }
      );
    }

    if (action.genericProperties.options) {
      _.each(action.genericProperties.options, (option) => {
        const oldKey = option.targetEventId;
        const newKey = eventDuplicateDict[option.targetEventId];
        if (oldKey !== newKey) {
          const optionIndex = action.genericProperties.options.findIndex(
            (option) => option.targetEventId === oldKey
          );
          action.genericProperties.options[optionIndex].targetEventId = newKey;
        }
        console.log(5.14, moment().diff(startMoment));
      });
    }

    console.log(5.151, moment().diff(startMoment));
    const newActionId = GameTypeEventActions.insert(action);
    console.log(newActionId);
    console.log(5.152, moment().diff(startMoment));
    actionsDuplicateDict[oldActionId] = newActionId;

    // console.log('duplicated action', oldActionId, 'under new _id:', newActionId);
    console.log(5.2, moment().diff(startMoment));
  });

  // start fixing references (blankEventUponPlacement Id's)
  _.each(eventDuplicateDict, (newEventId, oldEventId) => {
    GameTypeEvents.update(
      {
        gameTypeId: newGameTypeId,
        'genericProperties.blankEventUponPlacement': oldEventId,
      },
      {
        $set: { 'genericProperties.blankEventUponPlacement': newEventId },
      }
    );
    // console.log('updated blankEventUponPlacement from', oldEventId, 'to', newEventId);
  });

  _.each(actionsDuplicateDict, (newActionId, oldActionId) => {
    GameTypeEventActions.update(
      { gameTypeId: newGameTypeId, 'nextActions.default': oldActionId },
      {
        $set: { 'nextActions.default': newActionId },
      }
    );
    // console.log('updated nextActions.default from', oldActionId, 'to', newActionId);
  });
};

Meteor.methods({
  duplicateGameType(gameTypeId, startMoment) {
    if (true) {
      console.log('method start', moment().diff(startMoment));
      const gameType = GameTypes.findOne(gameTypeId);

      const duplicateFn = () => {
        // console.log('----------------------------------------');
        // console.log('START duplication of GameType', gameTypeId);
        delete gameType._id;

        const langKeys = Object.keys(gameType.gameTypeName);
        _.each(langKeys, (key) => {
          if (
            Object.prototype.hasOwnProperty.call(gameType.gameTypeName, key)
          ) {
            gameType.gameTypeName[
              key
            ] = `${gameType.gameTypeName[key]} (~COPY~)`;
          }
        });

        // replace the owner user with the account that duplicates it (so it's editable)
        // not if server is duplicating
        if (this.connection) {
          gameType.user = Meteor.userId();
          delete gameType.gameTypePublicUsers;
        }

        // console.log('gameTypeName', gameType.gameTypeName);

        const newGameTypeId = GameTypes.insert(gameType);

        // console.log('duplicated GameType under new _id:', newGameTypeId, 'for user:', Meteor.userId());

        // start duplicating the properties
        const gameTypeProperties = GameTypeProperties.find({
          gameTypeId,
        }).fetch();

        const propertyDuplicateDict = {};
        _.each(gameTypeProperties, (p) => {
          const property = p;
          const oldPropertyId = property._id;
          delete property._id;
          property.gameTypeId = newGameTypeId;

          const newPropertyId = GameTypeProperties.insert(property);
          propertyDuplicateDict[oldPropertyId] = newPropertyId;
          // console.log('duplicated property', oldPropertyId, 'under new _id:', newPropertyId);
        });

        console.log('before eventAndActions', moment().diff(startMoment));
        duplicateEventsAndActions(
          gameTypeId,
          newGameTypeId,
          propertyDuplicateDict,
          null,
          startMoment
        );

        // console.log('END duplication of GameType', gameTypeId, 'now available under', newGameTypeId);
        // console.log('----------------------------------------');
        return true;
      };
      return duplicateFn();
    }
  },
});

Meteor.startup(() => {
  const duplicateAndRemoveIds = ['sne3x4cg2oAt8v5HH'];
  const duplicateAndRemoveGameTypes = () => {
    duplicateAndRemoveIds.forEach((gameTypeId) => {
      const gameType = GameTypes.findOne(gameTypeId);
      console.log('gameType', gameType);
      if (gameType) {
        const it = Meteor.settings.private.ITERATIONS || 1;
        console.log('Iterations:', it);
        for (let j = 1; j <= it; j++) {
          const start = moment();
          console.log('START', start);
          Meteor.call('duplicateGameType', gameTypeId, start, (e, result) => {
            if (!e && result) {
              const end = moment();
              console.log('END Duplicating', j, end, `(${end.diff(start)}ms)`);

              // console.log(GameTypes.remove({_id: gameTypeId}));
            } else if (e) {
              console.log(e);
            }
          });
        }
      } else {
        console.log('els');
      }
    });
  };

  const startTime = moment();
  console.log('START - APPLICATION SPECIFIC TEST', startTime);
  console.log(1, moment().diff(startTime));
  Meteor.setTimeout(() => {
    Partitioner.directOperation(() => {
      duplicateAndRemoveGameTypes();
    });
  }, 10000);
  const endTime = moment();
  console.log(
    'END - APPLICATION SPECIFIC TEST',
    endTime,
    `(${endTime.diff(startTime)})`
  );

  let count = 0;

  const fibonacci = (num) => {
    if (num <= 1) {
      if (count++ % 100 === 0) {
        // console.log(`fibonacci temp ${num}`);
        count = 0;
      }
      return num;
    }
    return fibonacci(num - 1) + fibonacci(num - 2);
  };

  const start = moment();
  const iterations = Meteor.settings.private.ITERATIONS || 1;
  console.log('PT FIBONACCI START', start, 'iterations:', iterations);
  for (let i = 1; i <= iterations; i++) {
    const startIt = moment();
    fibonacci(43);
    const endIt = moment();
    console.log(
      `Fibonacci(43) - iteration ${i} - took ${endIt.diff(startIt)}ms`
    );
  }
  const end = moment();
  console.log('PT FIBONACCI END', end, `Took (${end.diff(start)}ms)`);
});
