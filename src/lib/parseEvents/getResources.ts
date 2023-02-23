export const getResources = (serverless: any) => {
  let ddbStreamTables = { ddb: {}, kinesis: {} };
  if (serverless.service.resources?.Resources) {
    ddbStreamTables = Object.entries(serverless.service.resources.Resources)?.reduce(
      (accum, obj: [string, any]) => {
        const [key, value] = obj;

        if (value.Type == "AWS::DynamoDB::Table") {
          const { TableName, StreamSpecification } = value.Properties;
          if (TableName) {
            accum.ddb[key] = {
              TableName,
            };

            if (StreamSpecification) {
              let StreamEnabled = false;
              if (!("StreamEnabled" in StreamSpecification) || StreamSpecification.StreamEnabled) {
                StreamEnabled = true;
              }
              accum.ddb[key]["StreamEnabled"] = StreamEnabled;

              if (StreamSpecification.StreamViewType) {
                accum.ddb[key]["StreamViewType"] = StreamSpecification.StreamViewType;
              }
            }
          }
        } else if (value.Type == "AWS::Kinesis::Stream") {
          const { Name, RetentionPeriodHours, ShardCount, StreamModeDetails } = value.Properties;

          accum.kinesis[key] = {
            Name,
            RetentionPeriodHours,
            ShardCount,
            StreamModeDetails,
          };
        }

        return accum;
      },
      { ddb: {}, kinesis: {} } as any
    );
  }
  return ddbStreamTables;
};
